import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import _ from 'underscore'

import webfontsGenerator from '../src/index.js'

var SRC = url.fileURLToPath(new URL('src', import.meta.url))
var FILES = _.map(fs.readdirSync(SRC), function(file) {
	return path.join(SRC, file)
})
var OPTIONS = {
	dest: url.fileURLToPath(new URL('../temp', import.meta.url)),
	files: FILES,
	fontName: 'fontName',
	types: ['svg', 'ttf', 'woff', 'woff2', 'eot'],
	html:  true
}

webfontsGenerator(OPTIONS, function(error) {
	if (error) console.log('Fail!', error)
	else console.log('Done!')
})
