'use strict';

const codes = {
	400: 'Bad Request',
	404: 'Not found',
	500: 'Internal Server Error',
	503: 'Service Unavailable'
};

function handler(dots, ctx, err) {
	if (err.message) ctx.state.err = err.message;

	switch (err.status) {
		case 400:
		case 404:
		case 503:
			ctx.status = err.status;
			return ctx.body = dots.status({
				code:        err.status,
				description: codes[err.status],
				addition:    err.addition});
		case 401:
			ctx.status = err.status;
			return ctx.body = dots.auth({
				wrong: err.wrong,
				file:  err.file
			});
		default: {
			ctx.status = 500;
			return ctx.body = dots.status({
				code:        '500',
				description: codes[500]});
		}
	}
}

module.exports = function(dots) {
	return handler.bind(null, dots);
};