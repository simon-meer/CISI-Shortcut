const express = require('express')
const app = express()
const ejs = require('ejs');
const cheerio = require('cheerio');
const request = require('request');
const async = require('async');
const morgan = require('morgan');
const _ = require('underscore');
const monithor = process.env.monithorUrl;
const baseUrl = process.env.baseUrl;
var cache = {
	'00_local': [
		{
			name: "Angebot",
			url: "https://localhost:9480/angebot/",
			terms: ["angebot"],
			tag: '00_local'
		},
		{
			name: "Betrieb",
			url: "http://localhost:9081/betrieb/",
			terms: ["betrieb"],
			tag: '00_local'
		},
		{
			name: "FOS",
			url: "https://localhost:9482/fos/",
			terms: ["fos"],
			tag: '00_local'
		},
	]
};
const AN_HOUR = 1000 * 60 * 60;

var updating = false;
var waitingList = [];
var lastCheck = 0;

// ##########################################
// # EXPRESS CONFIG
// ##########################################
app.engine("xml", ejs.renderFile);
app.use(morgan('tiny'))
app.use(express.static('public'));
app.get('/description.xml', (req, res) => {
	app.render("description.xml", { baseUrl: baseUrl}, function(err, xml) {
		if(err) {
			res.status(500).send(err);
			return;
		}

		res.type('application/xml').send(xml);
		// res.type('application/opensearchdescription+xml').send(xml);
	});
})

// ##########################################
// # ROUTES
// ##########################################
app.get('/suggestions/:term', (req, res) => {
	ensureLinks(() => {
		const results = findLinksByRequest(req.params.term);
		res.json([req.params.term,
		 	results.map(r => r.name + ":" + r.tag),
		 	results.map(r => r.name),
		 	results.map(r => baseUrl + "/goto/" + r.name + ":" + r.tag)
	 	]);
	});
});
//

app.get('/goto/:term', (req, res) => {
	ensureLinks(() => {
		const results = findLinksByRequest(req.params.term);

		if(!results.length || !results[0]) {
			res.status(404).end();
			return;
		}

		res.redirect(results[0].url);
	});
});

// ##########################################
// # HELPER FUNCTIONS
// ##########################################

function findLinksByRequest(request) {
	const splitted = request.split(/(?:[: -+]|%20)/);
	// console.log(splitted);
	var term, tag;
	if(splitted.length == 2) {
		term = splitted[0];
		tag = findTag(splitted[1]);
	} else {
		term = request;
	}

	return findLinks(tag, term);
}

function ensureLinks(callback) {
	if((new Date() - lastCheck) > AN_HOUR) {
		updateLinks(callback);
	} else {
		callback();
	}
}

function updateLinks(callback) {
	waitingList.push(callback);

	if(!updating) {
		console.log("Syncing links");
		updating = true;

		request(monithor + "/tags/", (err, res, content) => {
			const parsed = JSON.parse(content);
			async.parallel(
				parsed.map(tag => updateTag.bind(this, tag)),
				onFinished
			)
		})
	}

	const onFinished = () => {
		updating = false;
		lastCheck = new Date();
		var oldWaitingList = waitingList;
		waitingList = [];
		oldWaitingList.forEach(fn => fn());
	};
}

function updateTag(tag, callback) {
	request(monithor + "/tags/status/" + tag, (err, res, content) => {
		const parsed = JSON.parse(content);
		cache[tag.toLowerCase()] = parsed.jobs.map(
			job => ({
				url: job.url,
				name: job.name,
				//(/(?:_|(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z]))/i)
				terms: job.name.split(/([_\s])/g).concat([tag.replace(/^\d+_/, '').toLowerCase()]),
				tag: tag
			})
		);
		callback();
	})
}

function findTag(term) {
	term = term.toLowerCase();
	const keys = Object.keys(cache);
	var exactMatch = keys.find(t => t == term);
	if(exactMatch !== undefined) {
		return exactMatch;
	}

	return keys
		.filter(t => t.match(/^\d+/))
		.find(t => t.replace(/^\d+_/, '').startsWith(term))
		||
		keys
		.find(t => t.indexOf(term) >= 0);
}


function findLinks(tag, term) {
	var links;
	if(!tag) {
		links = _.flatten(_.values(cache), true);
	} else {
		links = cache[tag];
	}
	var matches = [];

	links.forEach(link => {
		if(link.name == term) {
			matches.push([1, link]);
		} else {
			const result = evalTerms(tag ? link.terms : link.terms.concat([link.tag]), term);
			if(result < Infinity) {
				matches.push([result, link]);
			}
		}
	});

	matches.sort((e1, e2) => e1[0] - e2[0]);
	return matches.map(m => m[1]);
}

function evalTerms(haystack, needle) {
	var multiplier = 1;
	if(!haystack.find(item => item == 'client')) {
		multiplier *= 10;
	}

	if(containsTerm(haystack, needle)) {
		return 10 * multiplier;
	}

	return Infinity;
}

function containsTerm(haystack, needle) {
	if(needle == "") {
		return true;
	}

	if(haystack.length == 0) {
		return false;
	}

	if(containsTerm(haystack.slice(1), needle)) {
		return true;
	}

	for(var i = 0; i < haystack.length; i++) {
		var length = Math.min(haystack[i].length, needle.length);
		for(var j = 0; j < length; j++) {
			if(haystack[i][j] == needle[j]) {
				if(containsTerm(haystack.slice(1), needle.substring(j + 1))) {
					return true;
				}
			} else {
				break;
			}
		}
	}
	return false;
}

// updateLinks(function() {
// 	console.log(cache);

// 	console.log(findLink(findTag("p"), 'angebot'));
// 	console.log(findTag("i"));
// 	console.log(findTag("t"));
// 	console.log(findTag("s"));
// 	console.log(findTag("l"));
// });

 
app.listen(3000)