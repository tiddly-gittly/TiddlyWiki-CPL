// Creator: Gk0Wk (https://github.com/Gk0Wk)
const path = require('path');
const fs = require('fs');
const {
    execSync
} = require('child_process');


/** 项目路径 */
const repoFolder = path.join(path.dirname(__filename), '..');

/**
 * 执行命令行指令，并打印该指令的结果
 * @param {string} command 要执行的命令
 * @param {object} options execSync的参数
 */
function shell(command, options) {
    if (options !== undefined) options = {};
    console.log(String(execSync(command, {
        cwd: repoFolder,
        ...options,
    })));
}
/**
 * 执行命令行指令，并打印该指令的结果，同时忽略任何错误
 * @param {string} command 要执行的命令
 * @param {object} options execSync的参数
 */
function shellI(command, options) {
    try {
        shell(command, options);
    } catch (error) {
        console.error(`[Shell Command Error] ${error}`)
    }
}

/**
 * 构建插件源
 * @param {string} distDir 目标路径，空或者不填则默认为'dist/library'
 * @param {boolean} minify 是否最小化HTML，默认为true
 */
function buildLibrary(distDir, minify) {
    if (typeof distDir !== 'string' || distDir.length === 0) distDir = 'dist/library';
    if (typeof minify !== 'boolean') minify = true;

    // 导出所有插件
    console.log(`Exporting all plugin informations`);
    shell(`npx tiddlywiki . --output ${distDir} --rendertiddler template.plugins.json plugins.json text/plain`);
    shellI(`mkdir ${distDir}/plugins`);
    let plugins = [];
    console.log(`Downloading all online plugins`);
    // 遍历所有插件
    JSON.parse(fs.readFileSync(`${distDir}/plugins.json`)).forEach((plugin) => {
        if (!plugin) return;
        if (!plugin['_title'] || plugin['_title'] === '') return;
        try {
            // 插件的合法目标路径
            let distPluginPath = `${distDir}/plugins/${encodeURIComponent(plugin['_title'].replace('$:/plugins/', '').replace(/[:/<>"\|?*]/g, '_'))}.json`;
            // 如果是外置的插件，需要下载下来
            if (plugin['uri'] && plugin['uri'] !== '') {
                console.log(`  - Downloading json plugin ${plugin['title']}`);
                shellI(`wget '${plugin['uri']}' -O ${distPluginPath} &> /dev/null`);
            }
            delete plugin['uri'];
            // 一般情况下，下载的JSON文件都是tiddler数组的形式，这种是没有办法被安装的
            let pluginjson = JSON.parse(fs.readFileSync(distPluginPath));
            if (pluginjson instanceof Array) pluginjson = pluginjson[0];
            // 解析，并判断是否是安装后需要重新加载页面的插件
            let shuoldReload = false;
            let shadowTiddlers = JSON.parse(pluginjson.text).tiddlers;
            let shadowTitles = Object.keys(shadowTiddlers);
            for (let i = 0, length = shadowTitles.length; i < length; i++) {
                const tiddler = shadowTiddlers[shadowTitles[i]];
                if (tiddler.type === "application/javascript" && tiddler.type['module-type'] !== undefined && tiddler.type['module-type'] !== '') {
                    shuoldReload = true;
                    break;
                }
            }
            plugin['requires-reload'] = shuoldReload;
            // 版本号的覆盖
            if (pluginjson['version'] && pluginjson['version'] !== '') plugin['version'] = pluginjson['version'];
            else if (plugin['version'] && plugin['version'] !== '') pluginjson['version'] = plugin['version'];
            // 保存更改
            fs.writeFileSync(distPluginPath, JSON.stringify(pluginjson));
        } catch (e) {
            console.error(e);
            return;
        }
        // TODO: 删除不必要的字段 -> 改成只保留指定的字段
        delete plugin['bag'];
        delete plugin['created'];
        delete plugin['creator'];
        delete plugin['modified'];
        delete plugin['modifier'];
        delete plugin['permissions'];
        delete plugin['recipe'];
        delete plugin['revision'];
        delete plugin['text'];
        delete plugin['type'];
        delete plugin['icon'];
        delete plugin['page-cover'];
        plugin['title'] = plugin['_title'];
        delete plugin['_title'];
        plugin['plugin-type'] = plugin['_type'];
        delete plugin['_type'];
        plugin['icon'] = plugin['plugin-icon'];
        delete plugin['plugin-icon'];
        plugins.push(plugin);
    });
    console.log(`Generating plugin library file`);
    // 生成插件源HTML文件
    fs.writeFileSync(`${distDir}/index-raw.html`, new String(fs.readFileSync(`scripts/library.emplate.html`)).replace('\'%%plugins%%\'', JSON.stringify(plugins)));
    shellI(`rm ${distDir}/plugins.json`);

    // 最小化：HTML
    if (minify) {
        console.log(`Minifying plugin library file`);
        shellI(`npx html-minifier-terser -c scripts/html-minifier-terser.config.json -o ${distDir}/index.html ${distDir}/index-raw.html && rm ${distDir}/index-raw.html`);
    } else {
        shellI(`mv ${distDir}/index-raw.html ${distDir}/index.html`);
    }
    console.log(`CPL generated`);
}

module.exports = {
    build: buildLibrary,
};
