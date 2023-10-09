(function () {
"use strict";

exports.name = "cpl-info-hook";
exports.platforms = ["browser"];
exports.after = ["cpl-repo-init"];
exports.synchronous = true;
exports.startup = function () {
    globalThis.__tiddlywiki_cpl__('Update').then(function (text) {
		var updatePlugins = JSON.parse(text);
		var t = {};
		for (var title in updatePlugins) {
			t[title] = updatePlugins[title][0];
		}
		$tw.wiki.addTiddler({ title: '$:/temp/CPL/plugin-infos.json', text: JSON.stringify(t), type: "application/json" });
	});
};
})();
