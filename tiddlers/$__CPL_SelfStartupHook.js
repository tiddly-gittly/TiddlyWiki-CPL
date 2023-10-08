(function () {
"use strict";
	
exports.name = "cpl-self-hook";
exports.platforms = ["browser"];
exports.after = ["cpl-repo-init"];
exports.synchronous = true;

exports.startup = function () {
	globalThis.__tiddlywiki_cpl__('Update').then(function (text) {
		var updatePlugins = JSON.parse(text);
		var t = [];
		for (var title in updatePlugins) {
			var tt = updatePlugins[title];
			t.push(`${title}: ${Array.isArray(tt) ? tt[0] : tt}`);
		}
		$tw.wiki.addTiddler({ title: '$:/temp/CPL/plugin-versions', text: t.join('\n') });
	});
};

})();