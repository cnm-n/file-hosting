'use strict';
const path = require('path');

const Koa    = require('koa');
const Router = require('koa-router');
const send   = require('koa-send');
const serve  = require('koa-static-cache');
const range  = require('koa-range');
const dots   = require("dot").process({path: path.join(__dirname, 'views')});

const Busboy = require('busboy');
const busboy = async headers => new Busboy({headers: headers});

const db      = require('./lib/db');
const Files   = require('./lib/files-api');
const httpErr = require('./lib/http-err')(dots);

const conf = require('./lib/config').app;

const app    = new Koa();
const router = new Router();

app.use(serve(path.join(__dirname, 'public'), conf.cache));
app.use(range);

app.on('error', err => {
	//ignore socket warnings
});

app.use(async (ctx, next) => {
	if (!db.isConnected) return httpErr(ctx, {status: 503, addition: 'Can\'t connect to the database'});

	ctx.state.date = new Date();

//session parser
	let sessionStr = ctx.cookies.get('session');
	if (sessionStr) var sessionArr = sessionStr.split('/');
	if (sessionArr && sessionArr.length === 2) ctx.state.session = {
		id:    sessionArr[0],
		token: sessionArr[1]
	};

	let time = process.hrtime();

//errors handler
	await next().catch(err => httpErr(ctx, err));
	if (!ctx.body) httpErr(ctx, {status: 404});

	time = process.hrtime(time);
	ctx.state.duration = time[0] * 1e9 + time[1];

//logger
	console.log(`${ctx.state.date.toLocaleString()} ${ctx.ip} ${ctx.method} ${ctx.url} ${ctx.headers.host} ${ctx.state.duration / 1e6} ms`);
	if (ctx.state.err) console.error(ctx.state.err);

	db.logReq(ctx).catch(err => console.error('log error: ' + err.message));
});

router.get(['/', '/upload'], async ctx => {
	return ctx.body = dots.upload();
});

router.get('/:id', async ctx => {
	let fileId = ctx.params.id;

	let doc = await db.authorization(fileId, ctx.state.session, ctx.state.date); //returns file object if successful or false
	if (!doc) return Promise.reject({status: 401, file: fileId});

	ctx.state.file = doc.file;

	if (!doc.group) {
		ctx.set('Content-Disposition', "filename*=UTF-8''" + encodeURI(doc.file.name + doc.file.ext));
		return send(ctx, fileId + doc.file.ext, {root: conf.storage});
	}
	else return ctx.body = dots.group({group: await db.getGroup(doc)});
});

router.post('/auth', async ctx => {
	let bboy = await busboy(ctx.req.headers).catch(err => {
		err.status   = 400;
		err.addition = err.message;
		return Promise.reject(err);
	});

	ctx.req.pipe(bboy);

	return new Promise((resolve, reject) => {
		let fileId = null;
		let pwd    = null;

		bboy.on('field', (field, val) => {
			if (field === 'password' && val !== '') pwd = val;
			else if (field === 'file') fileId = val;
		});
		bboy.on('finish', async () => {
			let session = await db.authentication(fileId, ctx.state.session, pwd, ctx.state.date).catch(reject);
			if (session === undefined) return;

			if (!session) return reject({status: 401, file: fileId, wrong: true});

			ctx.cookies.set('session', session.id + '/' + session.token, {maxAge: conf.cookie.maxAge});
			return resolve(ctx.redirect(fileId));
		});
		bboy.on('error', reject);
	});
});

router.post('/upload', async ctx => {
	let files = new Files(ctx.request.headers['content-length'], ctx.state.date);
	let error = null;

	let bboy = await busboy(ctx.req.headers).catch(err => {
		err.status   = 400;
		err.addition = err.message;
		return Promise.reject(err);
	});

	ctx.req.pipe(bboy);

	return new Promise((resolve, reject) => {
		bboy.on('field', (fieldname, val) => {
			if (fieldname === 'password' && val !== '') files.pwd = val;
			else if (fieldname === 'rename' && val === 'on') files.rename = true;
		});
		bboy.on('file', async(fieldname, fileStream, filename, encoding, mimetype) => {
			await files.upload(fileStream, filename, mimetype).catch(err => {
				error = err;
				fileStream.resume();
				return bboy.removeAllListeners('file');
			});
		});
		bboy.on('finish', () => {
			if (error) {
				reject(error);
				return files.remove();
			}
			db.insertFiles(files).then(insert => {
				if (insert.pwd) return db.ownerAuth(insert, ctx.state.session, ctx.state.date).then(session => {
					ctx.cookies.set('session', session.id + '/' + session.token, {maxAge: conf.cookie.maxAge});
					return resolve(ctx.body = dots.link({link: conf.host + insert._id}));
				});
				return resolve(ctx.body = dots.link({link: conf.host + insert._id}));
			}).catch(reject);
		});
	});
});

app.use(router.routes());

app.listen(conf.port);