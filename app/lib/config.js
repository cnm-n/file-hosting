'use strict';
const path = require('path');

const shortid = require('shortid');
const argon2  = require('argon2');

const storagePath = path.join(__dirname, '../storage');

const app = {
	host:    'http://localhost/',
	port:    80,
	storage: storagePath,
	cache: {
		maxAge: 24 * 60 * 60, //cache-control max-age in seconds
		buffer: true,
	},
	cookie: {
		maxAge: 60 * 60 * 24 * 30 * 1000, //cookie max-age in milliseconds
	}
};

const db = {
	dbString: 'mongodb://127.0.0.1:27017',
	dbConfig: {
		bufferMaxEntries: 0,
	}
};

const limits = {
	maxFiles:  10,
	sizeLimit: 1024 * 1024 * 100,
	descr: {
		count:  'The files limit was reached',
		size:   'Total size limit was reached',
		length: 'Missing or wrong "content-length"',
	},
};

const files = {
	storage: storagePath,
};

const util = {
	id: {
		generate: shortid.generate,
		validate: shortid.isValid
	},
	pwd: {
		hash:   argon2.hash,
		verify: argon2.verify
	},
};

module.exports = {
	db:     db,
	app:    app,
	util:   util,
	files:  files,
	limits: limits
};