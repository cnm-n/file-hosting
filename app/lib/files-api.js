'use strict';

const fs   = require('fs');
const path = require('path');

const log = require('./db').log;

const util   = require('./config').util;
const conf   = require('./config').files;
const limits = require('./config').limits;

fs.stat(conf.storage, err => {
	if (!err) return;
	fs.mkdir(conf.storage, err => {
		if (err) throw new Error('Storage folder does not exist and can not be created');
	});
});

class File {
	constructor(fileObj, rename, maxAge) {
		this._id   = util.id.generate();
		this.date  = fileObj.date;
		this.group = false;
		this.file  = {
			name: rename ? this._id : fileObj.name,
			ext:  fileObj.ext,
			type: fileObj.mime,
		};
		if (maxAge) this.expires = this.date.getTime() + maxAge;
	}
}

class Files {
	constructor (contentLength, date) {
		this.date   = date;
		this.length = Number(contentLength);

		if (!this.length)
			throw {status: 400, addition: limits.descr.length};

		if (this.length > limits.sizeLimit)
			throw {status: 400, addition: limits.descr.size};

		this.pwd    = null;
		this.rename = false;
		this.total  = 0;

		this.filesArr = [];
		this.idsArr   = [];
	}

	upload (fileStream, filename, mimetype) {
		return new Promise((resolve, reject) => {
			if (limits.maxFiles && this.filesArr.length > limits.maxFiles - 1)
				return reject({status: 400, addition: limits.descr.count});

			let fileObj  = path.parse(filename);
			fileObj.mime = mimetype;
			fileObj.date = this.date;

			let file     = new File(fileObj, this.rename);
			let filePath = path.join(conf.storage, file._id + fileObj.ext);

			this.idsArr.push(file._id);
			this.filesArr.push(file);

			let writeStream = fs.createWriteStream(filePath);
			writeStream.on('error', reject);

			fileStream.pipe(writeStream);

			fileStream.on('error', reject);
			fileStream.on('data', data => {
				this.total += data.length;
				if (this.total >= limits.sizeLimit) {
					fileStream.unpipe(writeStream);
					writeStream.end();
					return reject({status: 400, addition: limits.descr.size});
				}
			});
			fileStream.on('end', () => resolve(file));
		});
	}

	remove() {
		this.filesArr.forEach(item => {
			fs.unlink(path.join(conf.storage, item._id + item.file.ext), err => {
				if (err) log({message: err.message});
			});
		});
	}
}

module.exports = Files;