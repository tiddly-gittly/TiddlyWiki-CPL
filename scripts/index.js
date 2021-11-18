// Creator: Gk0Wk (https://github.com/Gk0Wk)
const path = require('path');
const fs = require('fs');
const {
    execSync
} = require('child_process');


/** 项目路径 */
const repoFolder = path.join(path.dirname(__filename), '..');
/** 获得TW版本号 */
const getVersion = '$(npx tiddlywiki . --version | grep -Eo \'^[0-9]+\.[0-9]+\.[0-9]+.*$\' | head -n 1)';

/** 设置环境变量，TW会同时在自己的源码路径以及环境变量定义的路径中寻找插件、主题和语言
 *  如果不这样写，plugins、themes、languages和editions里的内容就无法被加载
 */
process.env.TIDDLYWIKI_PLUGIN_PATH = `${repoFolder}/plugins`;
process.env.TIDDLYWIKI_THEME_PATH = `${repoFolder}/themes`;
process.env.TIDDLYWIKI_LANGUAGE_PATH = `${repoFolder}/languages`;
process.env.TIDDLYWIKI_EDITION_PATH = `${repoFolder}/editions`;

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
    shell(`npx tiddlywiki . --output ${distDir} --rendertiddler template.plugins.json plugins.json text/plain`);
    let plugins = [];
    JSON.parse(fs.readFileSync(`${distDir}/plugins.json`)).forEach((plugin) => {
        if (!plugin) return;
        if (!plugin.title || plugin.title === '') return;
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
        plugin['plugin-type'] = plugin['_type'];
        delete plugin['_type'];
        plugin['icon'] = plugin['plugin-icon'];
        delete plugin['plugin-icon'];
        plugins.push(plugin);
    });
    fs.writeFileSync(`${distDir}/index-raw.html`, new String(fs.readFileSync(`scripts/library.emplate.html`)).replace('\'%%plugins%%\'', JSON.stringify(plugins)));
    shellI(`rm ${distDir}/plugins.json`);

    // 最小化：HTML
    if (minify) {
        shellI(`npx html-minifier-terser -c scripts/html-minifier-terser.config.json -o ${distDir}/index.html ${distDir}/index-raw.html && rm ${distDir}/index-raw.html`);
    } else {
        shellI(`mv ${distDir}/index-raw.html ${distDir}/${htmlName}`);
    }
}

module.exports = {
    build: buildLibrary,
};
