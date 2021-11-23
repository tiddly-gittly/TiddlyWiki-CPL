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
    JSON.parse(fs.readFileSync(`${distDir}/plugins.json`)).forEach((plugin) => {
        if (!plugin) return;
        if (!plugin['_title'] || plugin['_title'] === '') return;
        try {
            let distPluginPath = `${distDir}/plugins/${encodeURIComponent(plugin['_title'].replace('$:/plugins/', '').replace(/[:/<>"\|?*]/g, '_'))}.json`;
            if (plugin['uri'] && plugin['uri'] !== '') {
                console.log(`  - Downloading json plugin ${plugin['title']}`);
                shellI(`wget ${plugin['uri']} -O ${distPluginPath} &> /dev/null`);
            }
            delete plugin['uri'];
            let pluginjson = JSON.parse(fs.readFileSync(`${distPluginPath}`))[0];
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
            if (pluginjson['version'] && pluginjson['version'] !== '') plugin['version'] = pluginjson['version'];
        } catch (e) {
            console.error(e);
            return;
        }
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
