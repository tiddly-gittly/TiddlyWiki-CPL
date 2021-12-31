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
function shell(command, options, output) {
  if (options !== undefined) options = {};
  let outputString = execSync(command, {
    cwd: repoFolder,
    ...options,
  });
  if (output) console.log(String(outputString));
}
/**
 * 执行命令行指令，并打印该指令的结果，同时忽略任何错误
 * @param {string} command 要执行的命令
 * @param {object} options execSync的参数
 */
function shellI(command, options, output) {
  try {
    shell(command, options, output);
  } catch (error) {
    console.error(`[Shell Command Error] ${error}`);
  }
}

/**
 * 判断是否是安装后需要重新加载页面的插件
 * @param {*} pluginTiddler 插件tiddler
 * @returns 需要重载则返回true，反之
 */
function ifPluginRequiresReload(pluginTiddler) {
  const shadowTiddlers = JSON.parse(pluginTiddler.text).tiddlers;
  const shadowTitles = Object.keys(shadowTiddlers);
  for (let i = 0, length = shadowTitles.length; i < length; i++) {
    const tiddler = shadowTiddlers[shadowTitles[i]];
    if (tiddler.type === "application/javascript" && tiddler.type['module-type'] !== undefined && tiddler.type['module-type'] !== '') {
      return true;
    }
  }
  return false;
}

/**
 * 格式化插件tiddler的名称
 * @param {*} title 插件tiddler的标题
 * @returns 格式化之后的文件名称
 */
function formatTitle(title) {
  return encodeURIComponent(
    title.replace('$:/plugins/', '')
      .replace('$:/languages/', '')
      .replace('$:/themes/', '')
      .replace(/[:/<>"\|?*]/g, '_')
  );
}

/**
 * 递归创建文件夹
 * @param {*} dirname 文件夹路径
 * @returns 创建成功则返回true
 */
function mkdirsSync(dirname) {
  if (fs.existsSync(dirname)) return true;
  mkdirsSync(path.dirname(dirname));
  return fs.mkdirSync(dirname);
}

function mergePluginInfo(pluginTiddler, infoTiddler) {
  infoTiddler['requires-reload'] = ifPluginRequiresReload(pluginTiddler);
  // 版本号的覆盖
  if (pluginTiddler.version && pluginTiddler.version !== '') infoTiddler.version = pluginTiddler.version;
  else if (infoTiddler.version && infoTiddler.version !== '') pluginTiddler.version = infoTiddler.version;
  // TODO: 删除不必要的字段 -> 改成只保留指定的字段
  delete infoTiddler.uri;
  delete infoTiddler.bag;
  delete infoTiddler.created;
  delete infoTiddler.creator;
  delete infoTiddler.modified;
  delete infoTiddler.modifier;
  delete infoTiddler.permissions;
  delete infoTiddler.recipe;
  delete infoTiddler.revision;
  delete infoTiddler.text;
  delete infoTiddler.type;
  delete infoTiddler.icon;
  delete infoTiddler['page-cover'];
  delete infoTiddler['tmap.id'];
  infoTiddler.title = infoTiddler._title;
  delete infoTiddler._title;
  infoTiddler['plugin-type'] = infoTiddler._type;
  delete infoTiddler._type;
  infoTiddler.icon = infoTiddler['plugin-icon'];
  delete infoTiddler['plugin-icon'];
  if (infoTiddler.documentation && infoTiddler.documentation !== '')
    infoTiddler.readme = `<$button class="tc-btn-invisible" message="tm-open-external-window" param="${infoTiddler.documentation}">{{$:/core/images/home-button}} <$text text="${infoTiddler.documentation}"/></$button><br/>` + infoTiddler.readme;
  if (infoTiddler.source && infoTiddler.source !== '')
    infoTiddler.readme = `<$button class="tc-btn-invisible" message="tm-open-external-window" param="${infoTiddler.source}">{{$:/core/images/github}} <$text text="${infoTiddler.source}"/></$button><br/>` + infoTiddler.readme;
  return { pluginTiddler, infoTiddler };
}

/**
 * 构建插件源
 * @param {string} distDir 目标路径，空或者不填则默认为'dist/library'
 * @param {boolean} minify 是否最小化HTML，默认为true
 */
function buildLibrary(distDir, minify) {
  if (typeof distDir !== 'string' || distDir.length === 0) distDir = 'dist/library';
  if (typeof minify !== 'boolean') minify = true;

  // 启动TW
  console.log('Loading plugin informations');
  const $tw = require('tiddlywiki/boot/boot').TiddlyWiki();
  $tw.boot.argv = ['.'];
  $tw.boot.boot();

  // 遍历、下载所有插件
  // console.log('Downloading all online plugins');
  const pluginsInfo = [];
  const pluginCallbackInfo = {
    title: '$:/temp/tw-cpl/plugin-callback-info',
    text: {},
    type: 'application/json',
  };
  const pluginInfoTiddlerTitles = $tw.wiki.filterTiddlers('[all[tiddlers]!is[draft]tag[$:/tags/PluginWiki]]');
  const downloadFileMap = {};
  mkdirsSync(`${distDir}/plugins`); // 插件目标目录
  mkdirsSync(`${distDir}/tmp`);     // 临时的插件目录
  shellI(`cp plugin_files/* ${distDir}/tmp/`); // 拷贝本地插件(未在网络上发布的)
  pluginInfoTiddlerTitles.forEach(title => {
    try {
      const tiddler = $tw.wiki.getTiddler(title).fields;
      // 带有uri，需要下载下来，但是需要是tw支持的格式
      if (tiddler.uri && tiddler.uri !== '' && $tw.config.fileExtensionInfo[path.extname(tiddler.uri)] && tiddler._title && tiddler._title !== '') {
        console.log(`- Downloading plugin file ${tiddler._title}`);
        const distPluginName = formatTitle(tiddler._title) + path.extname(tiddler.uri);
        if (downloadFileMap[tiddler.uri]) {
          shellI(`cp ${downloadFileMap[tiddler.uri]} ${distDir}/tmp/${distPluginName}`);
        } else {
          shellI(`wget '${tiddler.uri}' -O ${distDir}/tmp/${distPluginName}`);
          downloadFileMap[tiddler.uri] = `${distDir}/tmp/${distPluginName}`;
        }
      }
    } catch (e) { console.error(e); }
  });

  // 接下来从tmp/下获取所有的插件
  console.log('Exporting plugins');
  const files = fs.readdirSync(`${distDir}/tmp`);
  pluginInfoTiddlerTitles.forEach(title => {
    const tiddler = JSON.parse($tw.wiki.getTiddlerAsJson(title));
    if (!tiddler._title || tiddler._title === '') {
      console.warn(`[Warning] ${title} missed plugin title, skip this plugin.`);
      return;
    }
    try {
      const pluginName = formatTitle(tiddler._title);
      // 找到文件夹下对应的插件文件
      const tmp = [];
      const fileRegExp = new RegExp(pluginName + '\\..*');
      files.forEach(file => {
        if (!fileRegExp.test(file)) return;
        const extname = path.extname(file);
        if (extname === '') return;
        if (!$tw.config.fileExtensionInfo[extname]) return;
        tmp.push(file);
      });
      if (tmp.length == 0) {
        console.warn(`[Warning] Cannot find file ${pluginName}.*, skip this plugin.`);
        return;
      }
      const fileMIME = $tw.config.fileExtensionInfo[path.extname(tmp[0])].type;
      const fileText = fs.readFileSync(`${distDir}/tmp/${tmp[0]}`).toString('utf8');
      // 加载、提取插件文件
      const pluginTiddlers = [];
      $tw.utils.each($tw.wiki.deserializeTiddlers(fileMIME, fileText, {}), tiddler_ => {
        if (tiddler_.title === tiddler._title) pluginTiddlers.push(tiddler_);
      });
      if (pluginTiddlers.length === 0) {
        console.warn(`[Warning] Cannot find tiddler ${tiddler._title} in file ${tmp[0]}, skip this plugin.`);
        return;
      }
      const plugin = pluginTiddlers[0];
      // 整合信息
      const { pluginTiddler, infoTiddler } = mergePluginInfo(plugin, tiddler);
      // 保存插件
      fs.writeFileSync(`${distDir}/plugins/${pluginName}.json`, JSON.stringify(pluginTiddler));
      // 登记插件
      pluginsInfo.push(infoTiddler);
      pluginCallbackInfo.text[tiddler._title] = `${infoTiddler['requires-reload'] === true ? 'true' : 'false'}|${infoTiddler.version}`;
    } catch (e) { console.error(e); }
  });
  shellI(`rm -rf ${distDir}/tmp`);

  // 生成插件源HTML文件
  console.log(`Generating plugin library file`);
  fs.writeFileSync(`${distDir}/index-raw.html`, fs.readFileSync(`scripts/library.emplate.html`).toString('utf8').replace('\'%%plugins%%\'', JSON.stringify(pluginsInfo)));

  // 生成插件信息反馈
  pluginCallbackInfo.text = JSON.stringify(pluginCallbackInfo.text);
  fs.writeFileSync(`${distDir}/callback.json`, JSON.stringify(pluginCallbackInfo));

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
