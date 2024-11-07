import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { promisify } from 'util'
import _ from 'underscore'
import assert from 'assert'

import * as sass from 'node-sass'
import { readChunkSync } from 'read-chunk'
import { fileTypeFromBuffer } from 'file-type'

import webfontsGenerator from '../src/index.js'

describe('webfont', function() {
	var SRC = url.fileURLToPath(new URL('src', import.meta.url))
	var DEST = url.fileURLToPath(new URL('dest', import.meta.url))

	var FILES = _.map(fs.readdirSync(SRC), function(file) {
		return path.join(SRC, file)
	})

	var TYPES = ['ttf', 'woff', 'woff2', 'eot', 'svg']
	var FONT_NAME = 'fontName'

	var OPTIONS = {
		dest: DEST,
		files: FILES,
		fontName: FONT_NAME,
		types: TYPES
	}

	afterEach(function() {
		var files = _.map(fs.readdirSync(DEST), function(file) {
			return path.join(DEST, file)
		})
		for (var i in files) fs.unlinkSync(files[i])
	})

	it('generates all fonts and css files', function(done) {
		webfontsGenerator(OPTIONS, async function(err) {
			if (err) return done(err)

			var destFiles = fs.readdirSync(DEST)
			for (var i in TYPES) {
				var type = TYPES[i]
				var filename = FONT_NAME + '.' + type
				var filepath = path.join(DEST, filename)
				assert(destFiles.indexOf(filename) !== -1, type + ' file exists')
				assert(fs.statSync(filepath).size > 0, type + ' file is not empty')

				var DETECTABLE = ['ttf', 'woff', 'woff2', 'eot']
				if (_.contains(DETECTABLE, type)) {
					var chunk = readChunkSync(filepath, { startPosition: 0, length: 262 })
					var filetype = await fileTypeFromBuffer(chunk)
					assert.equal(type, filetype && filetype.ext, 'ttf filetype is correct')
				}
			}

			var cssFile = path.join(DEST, FONT_NAME + '.css')
			assert(fs.existsSync(cssFile), 'CSS file exists')
			assert(fs.statSync(cssFile).size > 0, 'CSS file is not empty')

			var htmlFile = path.join(DEST, FONT_NAME + '.html')
			assert(!fs.existsSync(htmlFile), 'HTML file does not exists by default')

			done(null)
		})
	})

	it('returns object with fonts and functions generateCss(), generateHtml()', function() {
		webfontsGenerator(OPTIONS, function(err, result) {
			assert(result.svg)
			assert(result.ttf)

			assert.equal(typeof result.generateCss, 'function')
			var css = result.generateCss()
			assert.equal(typeof css, 'string')

			assert.equal(typeof result.generateHtml, 'function')
			var html = result.generateHtml()
			assert.equal(typeof html, 'string')
		})
	})

	it('function generateCss can change urls', function() {
		webfontsGenerator(OPTIONS, function(err, result) {
			var urls = {svg: 'AAA', ttf: 'BBB', woff: 'CCC', eot: 'DDD'}
			var css = result.generateCss(urls)
			assert(css.indexOf('AAA') !== -1)
		})
	})

	it('gives error when "dest" is undefined', function(done) {
		var options = _.extend({}, OPTIONS, {dest: undefined})
		webfontsGenerator(options, function(err) {
			assert(err !== undefined)
			done()
		})
	})

	it('gives error when "files" is undefined', function(done) {
		var options = _.extend({}, OPTIONS, {files: undefined})
		webfontsGenerator(options, function(err) {
			assert(err !== undefined)
			done()
		})
	})

	it('uses codepoints and startCodepoint', function(done) {
		var START_CODEPOINT = 0x40
		var CODEPOINTS = {
			close: 0xFF
		}
		var options = _.extend({}, OPTIONS, {
			codepoints: CODEPOINTS,
			startCodepoint: START_CODEPOINT
		})
		webfontsGenerator(options, function(err) {
			if (err) return done(err)

			var svg = fs.readFileSync(path.join(DEST, FONT_NAME + '.svg'), 'utf8')

			function codepointInSvg(cp) {
				return svg.indexOf(cp.toString(16).toUpperCase()) !== -1
			}

			assert(codepointInSvg(START_CODEPOINT), 'startCodepoint used')
			assert(codepointInSvg(START_CODEPOINT+1), 'startCodepoint incremented')
			assert(codepointInSvg(CODEPOINTS.close), 'codepoints used')

			done()
		})
	})

	it('generates html file when options.html is true', function(done) {
		var options = _.extend({}, OPTIONS, {html: true})
		webfontsGenerator(options, function(err) {
			if (err) return done(err)

			var htmlFile = path.join(DEST, FONT_NAME + '.html')
			assert(fs.existsSync(htmlFile), 'HTML file exists')
			assert(fs.statSync(htmlFile).size > 0, 'HTML file is not empty')

			done(null)
		})
	})

	it('generates the same hash even when different "dest" is passed as an option', function(done) {
		var getHash = function (dest) {
			var cssFile = path.join(dest, FONT_NAME + '.css')
			var css = fs.readFileSync(cssFile, {
				encoding: 'UTF-8'
			})
			return css.match('.*' + FONT_NAME + '\\.\\w+\\?([\\da-f]{32}).*')[1]
		}

		var dest = DEST + 'some'
		var options = _.extend({}, OPTIONS, {
			dest: dest
		})
		webfontsGenerator(options, function(err) {
			if (err) return done(new Error(err))

			var hash = getHash(dest);

			dest = DEST + 'other'
			options = _.extend({}, OPTIONS, {
				dest: dest
			})
			webfontsGenerator(options, function(err) {
				if (err) return done(new Error(err))

				var newHash = getHash(dest);

				assert(hash === newHash)
				done(null)
			})
		})
	})

	describe('custom templates', function() {
		var TEMPLATE = url.fileURLToPath(new URL('customTemplate.hbs', import.meta.url))
		var TEMPLATE_OPTIONS = {
			option: 'TEST'
		}
		var RENDERED_TEMPLATE = 'custom template ' + TEMPLATE_OPTIONS.option + '\n'

		it('uses custom css template', function(done) {
			var options = _.extend({}, OPTIONS, {
				cssTemplate: TEMPLATE,
				templateOptions: TEMPLATE_OPTIONS
			})
			webfontsGenerator(options, function(err) {
				if (err) return done(err)
				var cssFile = fs.readFileSync(path.join(DEST, FONT_NAME + '.css'), 'utf8')
				assert.equal(cssFile, RENDERED_TEMPLATE)
				done(null)
			})
		})

		it('uses custom html template', function(done) {
			var options = _.extend({}, OPTIONS, {
				html: true,
				htmlTemplate: TEMPLATE,
				templateOptions: TEMPLATE_OPTIONS
			})
			webfontsGenerator(options, function(err) {
				if (err) return done(err)
				var htmlFile = fs.readFileSync(path.join(DEST, FONT_NAME + '.html'), 'utf8')
				assert.equal(htmlFile, RENDERED_TEMPLATE)
				done(null)
			})
		})
	})

	describe('custom context', function() {
		var TEMPLATE = url.fileURLToPath(new URL('customContextTemplate.hbs', import.meta.url))
		var TEMPLATE_OPTIONS = {
			option: 'TEST'
		}
		it('uses custom html context', function (done) {
			var options = _.extend({}, OPTIONS, {
				html: true,
				htmlTemplate: TEMPLATE,
				templateOptions: TEMPLATE_OPTIONS,
				htmlContext: function (context) {
					context.hello = 'world'
				},
			})
			webfontsGenerator(options, function (err) {
				if (err) return done(err)
				var htmlFile = fs.readFileSync(path.join(DEST, FONT_NAME + '.html'), 'utf8')
				assert.equal(htmlFile, 'world')
				done(null)
			})
		});

		it('uses custom css context', function (done) {
			var options = _.extend({}, OPTIONS, {
				cssTemplate: TEMPLATE,
				templateOptions: TEMPLATE_OPTIONS,
				cssContext: function (context) {
					context.hello = 'world'
				},
			})
			webfontsGenerator(options, function (err) {
				if (err) return done(err)
				var cssFile = fs.readFileSync(path.join(DEST, FONT_NAME + '.css'), 'utf8')
				assert.equal(cssFile, 'world')
				done(null)
			})
		})
	});

	describe('scss template', function() {
		var TEST_SCSS_SINGLE = url.fileURLToPath(new URL('scss/singleFont.scss', import.meta.url))
		var TEST_SCSS_MULTIPLE = url.fileURLToPath(new URL('scss/multipleFonts.scss', import.meta.url))

		it('creates mixins that can be used to create icons styles', function(done) {
			var DEST_CSS = path.join(DEST, FONT_NAME + '.scss')
			var options = _.extend({}, OPTIONS, {
				cssTemplate: webfontsGenerator.templates.scss,
				cssDest: DEST_CSS
			})
			webfontsGenerator(options, function(err) {
				if (err) return done(new Error(err))
				var rendered = sass.renderSync({
					file: TEST_SCSS_SINGLE
				})
				var css = rendered.css.toString()
				assert(css.indexOf(FONT_NAME) !== -1)
				done(null)
			})
		})

		it('multiple scss mixins can be used together', function() {
			var FONT_NAME_2 = FONT_NAME + '2'
			var DEST_CSS = path.join(DEST, FONT_NAME + '.scss')
			var DEST_CSS_2 = path.join(DEST, FONT_NAME_2 + '.scss')

			var options1 = _.extend({}, OPTIONS, {
				cssTemplate: webfontsGenerator.templates.scss,
				cssDest: DEST_CSS,
				files: [path.join(SRC, 'close.svg')]
			})
			var options2 = _.extend({}, OPTIONS, {
				fontName: FONT_NAME_2,
				cssTemplate: webfontsGenerator.templates.scss,
				cssDest: DEST_CSS_2,
				files: [path.join(SRC, 'back.svg')]
			})

			var generate1 = promisify(webfontsGenerator)(options1)
			var generate2 = promisify(webfontsGenerator)(options2)

			return Promise.all([generate1, generate2]).then(function() {
				var rendered = sass.renderSync({
					file: TEST_SCSS_MULTIPLE
				})
				var css = rendered.css.toString()
				assert(css.indexOf(FONT_NAME) !== -1)
				assert(css.indexOf(FONT_NAME_2) !== -1)
			})
		})
	})
})
