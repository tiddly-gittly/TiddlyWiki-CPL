(function(){
"use strict";
exports.shuffle = function(source,operator,options) {
	var results = [];
	source(function(tiddler,title) {
		results.push(title);
	});
	var m = results.length;
	var n = Math.min(Math.max(0, parseInt(operator.operand) || Infinity), results.length);
	for (var i = 0; i < n; i++) {
		var j = Math.floor(Math.random()*(m-i))+i;
		[results[j], results[i]] = [results[i], results[j]];
	}
	return results.slice(0, n);
};
})();