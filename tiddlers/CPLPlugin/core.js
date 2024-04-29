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
	var entry = $tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/current-repo', 'https://tiddly-gittly.github.io/TiddlyWiki-CPL/repo');
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
            messagerPromise = undefined;
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
	return parseInt($tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes', '-1')) || -1;
}

// 自动更新服务、各种消息通信
exports.startup = function () {
    globalThis.__tiddlywiki_cpl__ = cpl;
	// 检测更新
	var lastUpdateTime = -1;
    var updateLock = false;
	function update(notify) {
        try {
            if (updateLock) return;
            updateLock = true;
            lastUpdateTime = Date.now();
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: 'yes' });
            // filter 和 网络请求并发一下
            var updateP = cpl('Update');
            // 根据条件筛选插件
            var plugins = $tw.wiki.filterTiddlers($tw.wiki.getTiddlerText('$:/plugins/Gk0Wk/CPL-Repo/config/update-filter'));
            var t = [];
            updateP.then(function (text) {
                // 统计需要更新的插件
                var updatePlugins = JSON.parse(text);
                for (var title of plugins) {
                    var lastestVersion = updatePlugins[title]; // [version, coreVersion]
                    if (lastestVersion === undefined) continue; // 不存在该插件
                    if (lastestVersion[1] && $tw.utils.compareVersions($tw.version, lastestVersion[1].trim()) < 0) continue; // 插件兼容性检查
                    var version = $tw.wiki.getTiddler(title).fields.version;
                    if (version && lastestVersion[0] && $tw.utils.compareVersions(version.trim(), lastestVersion[0].trim()) >= 0) continue; // 插件是否更新
                    t.push(title);
                }
                if (t.length > 0) {
                    // 写入临时信息
                    $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/update-plugins', type: 'application/json', text: JSON.stringify(t) });
                    if (notify !== false) {
                        // 暂时修改通知停留时间为 10s
                        var tt = $tw.config.preferences.notificationDuration;
                        $tw.config.preferences.notificationDuration = 10_000;
                        // 弹出通知框
                        $tw.notifier.display("$:/plugins/Gk0Wk/CPL-Repo/update-notify-template", {
                            variables: { updateCount: t.length },
                        });
                        $tw.config.preferences.notificationDuration = tt;
                    }
                }
                $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/updaing');
                updateLock = false;
            }).catch(function (err) {
                console.error(err);
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: String(err) });
                updateLock = false;
            });
        } catch (err) {
            console.error(err);
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/updaing', text: String(err) });
            updateLock = false;
        }
	}

	// 监听自动更新策略的更改，调整更新间隔或者开关自动更新
	var autoUpdateInterval;
	var autoTimeout;
	$tw.wiki.addEventListener("change", function (changes) {
		if($tw.utils.hop(changes, '$:/plugins/Gk0Wk/CPL-Repo/config/auto-update-intervals-minutes')) {
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
    $tw.rootWidget.addEventListener("cpl-update-check", function () {
        update();
    });
    var installRequestLock = false;
    $tw.rootWidget.addEventListener("cpl-install-plugin-request", function (event) {
        try {
            if (installRequestLock) return;
            var paramObject = event.paramObject || {};
            var title = paramObject.title;
            var version = paramObject.version || "latest";
            if (!title) return;
            installRequestLock = true;
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/instal-plugin-requesting', text: 'yes', 'plugin-title': title });
            $tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/install-plugin-query-notify', { variables: {} });
            var existingTitle = new Set(); // 避免环
            var versionsMap = {};
            var versionsMapLatest = {};
            var sizesMap = {};
            // 递归检查依赖
            var title_ = title;
            function recursiveInstallCheck(title) {
                return new Promise(function (resolve, reject) {
                    cpl('Query', { plugin: title }).then(function (text) {
                        var data = JSON.parse(text);
                        existingTitle.add(title);
                        if (title === title_ && data.versions.indexOf(version) < 0) version = data.latest;
                        versionsMap[title] = data.versions;
                        versionsMapLatest[title] = data.latest;
                        sizesMap[title] = data['versions-size'] || {};
                        var t = new Set();
                        var promisese = [];
                        var subtree = {};

                        // for没有局部作用域，var不是迭代局部的
                        function fuckUpVar(ti) {
                            t.add(ti);
                            if (existingTitle.has(ti)) {
                                subtree[ti] = {};
                            } else {
                                promisese.push(recursiveInstallCheck(ti).then(
                                    function (tt) { subtree[ti] = tt; },
                                    function (tt) { reject(tt); },
                                ));
                            }
                        }
                        if (data['parent-plugin']) {
                            fuckUpVar(data['parent-plugin']);
                        }
                        for (var ti of $tw.utils.parseStringArray(data.dependents || '')) {
                            if (t.has(ti)) continue;
                            fuckUpVar(ti);
                        }
                        Promise.all(promisese).then(function () {
                            resolve(subtree);
                        });
                    }).catch(function (err) {
                        if (err.startsWith('404')) err = '[404] Cannot find plugin '+ title;
                        reject(err);
                    });
                });
            }

            recursiveInstallCheck(title).then(function (tree) {
                var f = {};
                for (var ti of existingTitle) {
                    if (ti === title) continue;
                    f['cpl-plugin#version#' + ti] = versionsMapLatest[ti];
                    f['cpl-plugin#install#' + ti] = $tw.wiki.tiddlerExists(ti) ? "no" : "yes";
                }
                f['cpl-plugin#version#' + title] = version;
                $tw.wiki.addTiddler({
                    title: '$:/temp/CPL-Repo/instal-plugin-request-tree/' + title,
                    type: 'application/json',
                    text: JSON.stringify({ title: title, versions: versionsMap, sizes: sizesMap, tree: tree }),
                    ...f,
                });
                $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/instal-plugin-requesting');
                $tw.modal.display('$:/plugins/Gk0Wk/CPL-Repo/install-plugin-request-model-template', {
                    variables: {
                        requestTiddler: '$:/temp/CPL-Repo/instal-plugin-request-tree/' + title,
                    },
                    event: event,
                });
            }).catch(function (err) {
                console.error(err);
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/instal-plugin-requesting', text: err, 'plugin-title': title });
            }).finally(function () {
                installRequestLock = false;
            });
        } catch (err) {
            console.error(err);
            installRequestLock = false;
        }
    });
    var installLock = false;
    $tw.rootWidget.addEventListener("cpl-install-plugin", function (event) {
        try {
            if (installLock) return;
            var paramObject = event.paramObject || {};
            var response = paramObject.response;
            if (!$tw.wiki.tiddlerExists(response)) return;
            var responseTiddler = $tw.wiki.getTiddler(response).fields;
            $tw.wiki.deleteTiddler(response);
            var data = JSON.parse(responseTiddler.text);
            var rootPlugin = data.title;
            var plugins = [[rootPlugin, responseTiddler['cpl-plugin#version#'+rootPlugin]]];
            for (var plugin in data.versions) {
                if (responseTiddler['cpl-plugin#install#'+plugin] === 'yes' && responseTiddler['cpl-plugin#version#'+plugin]) {
                    plugins.push([plugin, responseTiddler['cpl-plugin#version#'+plugin]]);
                }
            }
            var total = plugins.length;
            var count = 0;
            installLock=true;
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/installing-plugin', text: 'yes', 'plugin-title': rootPlugin });
            Promise.all(plugins.map(function (t) {
                return cpl('Install', { plugin: t[0], version: t[1] }).then(function (text) {
                    $tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/downloading-notify', {
                        variables: { plugin: t[0], count: ++count, total: total },
                    });
                    return new $tw.Tiddler($tw.utils.parseJSONSafe(text));
                });
            })).then(function (tiddlers) {
                $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/installing-plugin');
                for (var tiddler of tiddlers) {
                    $tw.wiki.addTiddler(tiddler);
                }
                $tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/downloading-complete-notify', { variables: {} });
            }).catch(function (err) {
                console.error(err);
                $tw.notifier.display('$:/plugins/Gk0Wk/CPL-Repo/downloading-fail-notify', {
                    variables: { message: err },
                });
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/installing-plugin', text: err, 'plugin-title': rootPlugin });
            }).finally(function () {
                installLock = false;
            });
        } catch (e) {
            console.error(e);
            installLock = false;
        }
    });
    var tmpIndex;
    var tmpAllPlugins;
    var tmpCategories;
    var getPluginsIndexLock = false;
    $tw.rootWidget.addEventListener("cpl-get-plugins-index", function () {
        try {
            if (getPluginsIndexLock) return;
            getPluginsIndexLock = true;
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/getting-plugins-index', text: 'yes' });
            cpl('Index').then(function (text) {
                var data = JSON.parse(text);
                var pluginMap = {};
                var categories = {};
                var authors = {};
                var allPlugins = [];
                var allTags = new Set();
                for (var p of data) {
                    pluginMap[p.title] = p;
                    allPlugins.push(p.title);
                    if (p.category && p.category !== 'Unknown') {
                        if (categories[p.category] === undefined) categories[p.category] = [];
                        categories[p.category].push(p.title);
                    }
                    if (p.author) {
                        if (authors[p.author] === undefined) authors[p.author] = [];
                        authors[p.author].push(p.title);
                    }
                    if (!p.title.startsWith('$:/languages') && p.title.split('/').length === 4) {
                        var a = p.title.split('/')[2];
                        if (a !== p.author) {
                            if (authors[a] === undefined) authors[a] = [];
                            authors[a].push(p.title);
                        }
                    }
                    if (p.tags) {
                        for (var tag of $tw.utils.parseStringArray(p.tags)) {
                            allTags.add(tag);
                        }
                    }
                }
                tmpIndex = data;
                tmpAllPlugins = allPlugins;
                tmpCategories = categories;
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/plugins-index', text: JSON.stringify(pluginMap), type: 'application/json' });
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/categories', text: JSON.stringify(categories), type: 'application/json' });
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/authors', text: JSON.stringify(authors), type: 'application/json' });
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/tags', text: JSON.stringify(Array.from(allTags)), type: 'application/json' });
                $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/getting-plugins-index');
            }).catch(function (err) {
                console.error(err);
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/getting-plugins-index', text: err });
            }).finally(function () {
                getPluginsIndexLock = false;
            });
        } catch (err) {
            console.error(err);
            getPluginsIndexLock = false;
        }
    });
    var queryPluginLocks = new Set();
    $tw.rootWidget.addEventListener("cpl-query-plugin", function (event) {
        try {
            var paramObject = event.paramObject || {};
            var title = paramObject.title;
            if (queryPluginLocks.has(title)) return;
            if (!title) return;
            queryPluginLocks.add(title);
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/querying-plugin/' + title, text: 'yes' });
            cpl('Query', { plugin: title }).then(function (text) {
                var data = JSON.parse(text);
                // 计算作者
                if (!data.author) {
                    if (!data.title.startsWith('$:/languages') && data.title.split('/').length === 4) {
                        data.author = data.title.split('/')[2];
                    }
                }
                // 相似推荐
                var suggestions = [];
                if (tmpIndex && data.category !== 'Language') {
                    // 基于标签距离进行推荐
                    if (data.tags) {
                        var tags = new Set($tw.utils.parseStringArray(data.tags).map(function (t) { return t.toLowerCase(); }));
                        for (var plugin of tmpIndex) {
                            if (!plugin.tags || plugin.title === title) continue;
                            var weight = 0;
                            for (var t of $tw.utils.parseStringArray(data.tags)) {
                                if (tags.has(t.toLowerCase())) weight++;
                            }
                            if (weight === 0) continue;
                            suggestions.push([plugin.title, weight]);
                        }
                    }
                    // 按照权重排序
                    suggestions.sort(function (a, b) { return b[1] - a[1]; });
                    suggestions = suggestions.slice(0, 20).map(function (t) { return t[0] });
                    // 如果数量不够，用同category
                    if (suggestions.length < 20 && data.category !== '' && data.category !== 'Unknown') {
                        var tset = new Set(suggestions);
                        for (var p of (tmpCategories[data.category] ?? [])) {
                            if (tset.has(p) || p === title) continue;
                            suggestions.push(p);
                            if (suggestions.length >= 20) break;
                        }
                    }
                }
                data.suggestions = $tw.utils.stringifyList(suggestions);
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/plugin-info/' + title, text: JSON.stringify(data), type: 'application/json' });
                $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/querying-plugin/' + title);
            }).catch(function (err) {
                console.error(err);
                $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/querying-plugin/' + title, text: err });
            }).finally(function () {
                queryPluginLocks.delete(title);
            });
        } catch (err) {
            console.error(err);
            if (event.paramObject && event.paramObject.title) queryPluginLocks.delete(event.paramObject.title);
        }
    });
    // 插件查询
    var searchPluginsLock = false;
    $tw.rootWidget.addEventListener("cpl-search-plugins", function (event) {
        try {
            if (searchPluginsLock) return;
            if (tmpAllPlugins === undefined) return;
            var paramObject = event.paramObject || {};
            var mode = paramObject.mode ?? '';
            var text = paramObject.text ?? '';
            var saveTo = paramObject.saveTo ?? '';
            if (!saveTo) return;
            searchPluginsLock = true;
            switch (mode) {
                case "mix": {
                    if (text.length < 3) {
                        // 字太少，匹配量爆炸，直接返回所有
                        $tw.wiki.addTiddler({
                            title: saveTo,
                            text: JSON.stringify(tmpAllPlugins),
                            type: 'application/json'
                        });
                    } else {
                        $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/searching-plugin', text: 'yes' });
                        var patterns = new Set(text.split(/\s+/).map(function (t) { return t.toLowerCase(); }));
                        patterns = new Set(Array.from(patterns).slice(0, 10)); // 再多性能撑不住了
                        var suggestions = [];
                        for (var plugin of tmpIndex) {
                            var weight = 0;
                            // 标题、作者、名称的搜索 10 权重
                            for (var f of ['title', 'author', 'name']) {
                                if (plugin[f]) {
                                    var t = plugin[f].toLowerCase();
                                    for (var pattern of patterns) {
                                        if (t.indexOf(pattern) >= 0) weight += 10;
                                    }
                                }
                            }
                            // tag 的搜索 5 权重
                            if (plugin.tags) {
                                for (var t of $tw.utils.parseStringArray(plugin.tags)) {
                                    if (patterns.has(t.toLowerCase())) weight += 5;
                                }
                            }
                            // description 搜索 2 权重
                            if (plugin.description) {
                                var t = plugin.description.toLowerCase();
                                for (var pattern of patterns) {
                                    if (t.indexOf(pattern) >= 0) weight += 2;
                                }
                            }
                            // readme 搜索 1 权重
                            if (plugin.description) {
                                var t = plugin.description;
                                for (var pattern of patterns) {
                                    if (t.indexOf(pattern) >= 0) weight += 1;
                                }
                            }
                            if (weight === 0) continue;
                            suggestions.push([plugin.title, weight]);
                        }
                        // 按照权重排序
                        suggestions.sort(function (a, b) { return b[1] - a[1]; });
                        suggestions = suggestions.map(function (t) { return t[0] });
                        $tw.wiki.addTiddler({
                            title: saveTo,
                            text: JSON.stringify(suggestions),
                            type: 'application/json'
                        });
                        $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/searching-plugin');
                    }
                    break;
                }
                case "tags": {
                    $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/searching-plugin', text: 'yes' });
                    var tags = new Set($tw.utils.parseStringArray(text).map(function (t) { return t.toLowerCase(); }));
                    var result = [];
                    for (var plugin of tmpIndex) {
                        if (!plugin.tags) continue;
                        var matched = true;
                        for (var t of $tw.utils.parseStringArray(plugin.tags)) {
                            if (tags.has(t.toLowerCase())) continue;
                            matched = false;
                            break;
                        }
                        if (matched) result.push(plugin.title);
                    }
                    $tw.wiki.addTiddler({
                        title: saveTo,
                        text: JSON.stringify(result),
                        type: 'application/json'
                    });
                    $tw.wiki.deleteTiddler('$:/temp/CPL-Repo/searching-plugin');
                    break;
                }
                default: {
                    return;
                }
            }
            searchPluginsLock = false;
        } catch (err) {
            console.error(err);
            $tw.wiki.addTiddler({ title: '$:/temp/CPL-Repo/searching-plugin', text: String(err) });
            searchPluginsLock = false;
        }
    });
};

/*
安装插件
<$action-sendmessage $message="cpl-install-plugin" title="xxx" version="latest"/>
$:/temp/CPL-Repo/installing-plugin 如果为 yes 说明正在安装，请勿进行其他操作 如果不是yes，如果非空说明是错误信息   plugin-title字段是正在安装的插件

获取所有插件的索引
<$action-sendmessage $message="cpl-get-plugins-index"/>
$:/temp/CPL-Repo/plugins-index 所有信息
$:/temp/CPL-Repo/getting-plugins-index 同上

查询某个插件的信息
<$action-sendmessage $message="cpl-query-plugin" title="xxx"/>
$:/temp/CPL-Repo/plugin-info/<插件title> 插件的相关信息
$:/temp/CPL-Repo/querying-plugin/<插件title> 同上
*/
})();
