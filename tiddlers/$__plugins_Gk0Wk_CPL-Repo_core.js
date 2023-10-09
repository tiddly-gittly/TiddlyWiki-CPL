(function () {
"use strict";

exports.name = "cpl-repo-init";
exports.platforms = ["browser"];
exports.after = ["render"];
exports.synchronous = true;

/**
 * CPL通信接口，往返，异步
 * const result = await globalThis.__tiddlywiki_cpl__('类型', { ... });
 */
var messagerPromise;
var previousEntry;
var cpl = function (type, payload) {
	var entry = $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/core-entry', 'https://tiddly-gittly.github.io/TiddlyWiki-CPL/library/all');
	if (previousEntry !== entry && globalThis.__tiddlywiki_cpl__reset__ !== undefined) globalThis.__tiddlywiki_cpl__reset__();
	previousEntry = entry;
    if (messagerPromise === undefined) messagerPromise = new Promise(function (rrr) {
        var counter = 0;
        var callbackMap = new Map();
        var iframe = $tw.utils.domMaker("iframe", {
        document,
        attributes: { src: entry },
        style: { display: "none" },
        });
        function ccc(e) {
            //console.log('<=', e.data);
            if (iframe.contentWindow === null || e.source !== iframe.contentWindow)
                return;
            if (e.data.target !== "tiddlywiki-cpl" || e.data.token === undefined)
                return;
            switch (e.data.type) {
                case "Ready": {
                if (counter === 0) {
                    counter++;
                    rrr(function (type, payload) {
                        return new Promise(function (resolve, reject) {
                            var token = counter++;
                            callbackMap.set(token, [resolve, reject]);
                            //console.log('=>', { type, token, target: "tiddlywiki-cpl", ...payload });
                            iframe.contentWindow.postMessage(
                                Object.assign({}, payload, {
                                    type: type,
                                    token: token,
                                    target: "tiddlywiki-cpl",
                                }),
                                "*"
                            );
                        });
                    });
                }
                break;
                }
                default: {
                var r = callbackMap.get(e.data.token);
                if (r !== undefined) {
                    callbackMap.delete(e.data.token);
                    r[e.data.success ? 0 : 1](e.data.payload);
                }
                break;
                }
            }
        }
        window.addEventListener("message", ccc);
        document.body.appendChild(iframe);
        globalThis.__tiddlywiki_cpl__reset__ = function () {
        delete globalThis.__tiddlywiki_cpl__reset__;
        window.removeEventListener("message", ccc);
        iframe.parentNode.removeChild(iframe);
        callbackMap.forEach((r) => {
            r[1]();
        });
        };
    });
  return messagerPromise.then(function (r) { return r(type, payload) });
};

function getAutoUpdateTime() {
	return parseInt($tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/auto-update-intervals-minutes', '-1')) || -1;
}

// 自动更新服务、各种消息通信
exports.startup = function () {
    globalThis.__tiddlywiki_cpl__ = cpl;
	// 检测更新
	var lastUpdateTime = -1;
	function update() {
		lastUpdateTime = Date.now();
		// filter 和 网络请求并发一下
		var updateP = cpl('Update');
		// 根据条件筛选插件
		var plugins = $tw.wiki.filterTiddlers($tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/auto-update-filter'));
		var t = [];
		updateP.then(function (text) {
			// 统计需要更新的插件
			var updatePlugins = JSON.parse(text);
			for (var title of plugins) {
				var lastestVersion = updatePlugins[title]; // [version, coreVersion]
				if (lastestVersion === undefined) continue; // 不存在该插件
				if (lastestVersion[1] && $tw.utils.compareVersions($tw.version, lastestVersion[1]) < 0) continue; // 插件兼容性检查
				var version = $tw.wiki.getTiddler(title).fields.version;
				if (version && $tw.utils.compareVersions(version, lastestVersion[0]) >= 0) continue; // 插件是否更新
				t.push(title);
			}
			if (t.length > 0) {
                // 写入临时信息
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/update-plugins', type: 'application/json', text: JSON.stringify(t) });
				// 暂时修改通知停留时间为 10s
				var tt = $tw.config.preferences.notificationDuration;
				$tw.config.preferences.notificationDuration = 10_000;
				// 弹出通知框
				$tw.notifier.display("$:/plugins/Gk0Wk/CPL-Repo/update-notify-template", {
					variables: { updateCount: t.length },
				});
				$tw.config.preferences.notificationDuration = tt;
			}
		}).catch(function (err) {
			console.error(err);
		});
	}

	// 监听自动更新策略的更改，调整更新间隔或者开关自动更新
	var autoUpdateInterval;
	var autoTimeout;
	$tw.wiki.addEventListener("change", function (changes) {
		if($tw.utils.hop(changes, '$:/plugins/Gk0Wk/CPL-Repo/auto-update-intervals-minutes')) {
            var time = getAutoUpdateTime();
			if (autoUpdateInterval !== undefined) clearInterval(autoUpdateInterval);
			if (autoTimeout !== undefined) clearTimeout(autoTimeout);
			autoUpdateInterval = undefined;
			autoTimeout = undefined;
			if (time > 0) {
				autoTimeout = setTimeout(function () {
					update();
					autoUpdateInterval = setInterval(function () {
						update();
					}, time * 60_000);
				}, lastUpdateTime === -1 ? 0 : time * 60_000 + lastUpdateTime - Date.now());
			}
		}
        if($tw.titleWidgetNode.refresh(changes, $tw.titleContainer, null)) {
            document.title = $tw.titleContainer.textContent;
        }
	});
	// 最初启用
	autoTimeout = setTimeout(function () {
        var time = getAutoUpdateTime();
		if (time > 0) {
            update();
            autoUpdateInterval = setInterval(function () {
                update();
            }, time * 60_000);
        }
	}, 3_000);


    // 消息监听
    var installLock = false;
    $tw.rootWidget.addEventListener("cpl-install-plugin", function (event) {
        if (installLock) return;
        var paramObject = event.paramObject || {};
        var title = paramObject.title;
        var version = paramObject.version || "latest";
        if (!title) return;
        installLock = true;
        $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/installing-plugin', text: 'yes', 'plugin-title': title });
        cpl('Install', { plugin: title, version: version }).then(function (text) {
            var tiddler = $tw.utils.parseJSONSafe(text);
            $tw.wiki.addTiddler(new $tw.Tiddler(tiddler));
            $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/installing-plugin');
        }).catch(function (err) {
            console.error(err);
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/installing-plugin', text: err, 'plugin-title': title });
        }).finally(function () {
            installLock = false;
        });
    });
    var getPluginsIndexLock = false;
    $tw.rootWidget.addEventListener("cpl-get-plugins-index", function () {
        if (getPluginsIndexLock) return;
        getPluginsIndexLock = true;
        $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/getting-plugins-index', text: 'yes' });
        cpl('Index').then(function (text) {
            var data = JSON.parse(text);
            var pluginMap = {};
            var categories = {};
            for (var p of data) {
                pluginMap[p.title] = p;
                if (p.category && p.category !== 'Unknown') {
                    if (categories[p.category] === undefined) categories[p.category] = [];
                    categories[p.category].push(p.title);
                }
            }
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/plugins-index', text: JSON.stringify(pluginMap), type: 'application/json' });
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/categories', text: JSON.stringify(categories), type: 'application/json' });
            $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/getting-plugins-index');
        }).catch(function (err) {
            console.error(err);
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/getting-plugins-index', text: err });
        }).finally(function () {
            getPluginsIndexLock = false;
        });
    });
    var queryPluginLocks = new Set();
    $tw.rootWidget.addEventListener("cpl-query-plugin", function (event) {
        var paramObject = event.paramObject || {};
        var title = paramObject.title;
        if (queryPluginLocks.has(title)) return;
        if (!title) return;
        queryPluginLocks.add(title);
        $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/querying-plugin', text: 'yes', 'plugin-title': title });
        cpl('Query', { plugin: title }).then(function (text) {
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/plugin-info/' + title, text: text, type: 'application/json' });
            $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/querying-plugin');
        }).catch(function (err) {
            console.error(err);
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/querying-plugin', text: err, 'plugin-title': title });
        }).finally(function () {
            queryPluginLocks.delete(title);
        });
    });
};
})();
