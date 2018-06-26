'use strict';

const MongoClient = require('mongodb').MongoClient;

const conf = require('./config').db;
const util = require('./config').util;

let db = null;

let connected = false;

MongoClient.connect(conf.dbString, conf.dbConfig).then(client => {
	connected = true;

	let storage = client.db('storage');
	storage.on('close', () => {
		connected = false;
		console.error('db disconnected');
	});
	storage.on('reconnect', () => {
		connected = true;
		console.log('db reconnected');
	});

	db = {
		files:    storage.collection('files'),
		sessions: storage.collection('sessions'),
		logs:     storage.collection('logs')
	}
}).catch(err => {
	console.error('\r\n' + err.message);
	process.exit();
});

function log(obj) {
	return db.logs.insertOne(obj);
}

function logReq(ctx) {
	let obj = {
		address: ctx.ip,
		method:  ctx.method,
		url:     ctx.url,
		status:  ctx.status,
		host:    ctx.headers.host,
		cookie:  ctx.headers.cookie
	};
	if (ctx.state) Object.assign(obj, ctx.state);

	return db.logs.insertOne(obj);
}

function getGroup(group) {
	return db.files.find({_id: {$in: group.files}}).toArray();
}

async function authorization(fileId, cookie, date) {
	if (!util.id.validate(fileId)) return Promise.reject({status: 404});

	let file = await db.files.findOne({_id: fileId});
	if (!file) return Promise.reject({status: 404});

	if (file.expires && file.expires >= date.getTime())
		return Promise.reject({status: 404, addition: 'Storage time expired'});

	if (!file.pwd) return file;

	if (!(
		cookie &&
		util.id.validate(cookie.id) &&
		util.id.validate(cookie.token)
	)) return false;

	let session = await db.sessions.findOne({_id: cookie.id});

	if (!(
		session &&
		cookie.token === session.token &&
		'access' in session &&
		file._id in session.access
	)) return false;

	return session.access[file._id] === file.token ? file : false;
}

async function authentication(fileId, cookie, pwd, date) {
	if (!util.id.validate(fileId)) return Promise.reject({status: 404});
	if (!pwd) return false;

	let file = await db.files.findOne({_id: fileId});
	if (!file) return Promise.reject({status: 404});

	if (!await util.pwd.verify(file.pwd, pwd)) return false;

	return initSession(file, cookie, date);
}

async function initSession(file, cookie, date) {
	let session = null;

	if (
		cookie &&
		util.id.validate(cookie.id) &&
		util.id.validate(cookie.token)
	) session = await db.sessions.findOne({_id: cookie.id});

	if (!session) session = {
		_id:    util.id.generate(),
		token:  util.id.generate(),
		date:   date,
		access: {}
	};
	else {
		session.token = util.id.generate();
		session.date  = date;
	}

	if (!file.group) session.access[file._id] = file.token;
	else {
		let filesArr = await db.files.find({_id: {$in: file.files}}).toArray();

		session.access[file._id] = file.token;
		filesArr.forEach(el => session.access[el._id] = el.token);
	}

	let update = await db.sessions.updateOne({_id: session._id}, {$set: session}, {upsert: true});

	if (!update.result.ok)
		return Promise.reject(new Error('DB Error: could not create new session'));

	return {
		id:    session._id,
		token: session.token
	};
}

async function insertFiles(files) {
	let length = files.filesArr.length;

	if (length > 1) {
		let group = {
			_id:   util.id.generate(),
			date:  files.date,
			group: true,
			files: files.idsArr
		};
		files.filesArr.push(group);
	}
	if (files.pwd) {
		let token = util.id.generate();
		files.pwd = await util.pwd.hash(files.pwd);

		files.filesArr.forEach(el => {
			el.pwd   = files.pwd;
			el.token = token;
		});
	}

	let insert = await db.files.insertMany(files.filesArr);

	if (!insert.result.ok)
		return Promise.reject(new Error('DB Error: could not insert new file'));

	return length > 1 ? files.filesArr[length] : files.filesArr[0];
}

module.exports = {
	authentication: authentication,
	authorization:  authorization,
	insertFiles:    insertFiles,
	ownerAuth:      initSession,
	getGroup:       getGroup,
	logReq:         logReq,
	log:            log,

	get isConnected() {
		return connected;
	}
};


