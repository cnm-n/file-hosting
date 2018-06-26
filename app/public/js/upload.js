'use strict';

let input  = document.querySelector('#file');
let status = document.querySelector('.file');
let submit = document.querySelector('.submit');

let terminal = document.querySelector('.console');

input.addEventListener('input', e => {
	console.log('input');
});

input.addEventListener('input', e => {
	console.log('change');
	let lastChild = terminal.lastChild;
	if (lastChild) lastChild.classList.add('history');

	let files = e.target.files;
	if (files.length < 1) return;

	status.innerText = 'files selected: ' + files.length;

	let selected  = document.createElement('div');
	let filesNode = document.createElement('div');

	selected.className = 'console-message selected';
	selected.innerHTML = `<div>Selected:&nbsp;</div>`;
	filesNode.className = 'files';

	for (let i of files) {
		filesNode.innerHTML += (`<div class="file">${i.name}</div>`);
	}

	selected.appendChild(filesNode);
	terminal.appendChild(selected);
});

input.addEventListener('click', e => {
	let lastChild = terminal.lastChild;
	if (lastChild) lastChild.classList.add('history');

	e.target.value = null;
	status.innerText = 'files selected: 0';
});

submit.addEventListener('click', e => {
	if (input.files.length) return;

	let err = document.createElement('div');
	err.className = 'console-message error';
	err.innerHTML =
		`<div">Error:</div>
		<div">no files selected</div>`;

	let lastChild = terminal.lastChild;
	if (lastChild) lastChild.classList.add('history');

	terminal.appendChild(err);
});