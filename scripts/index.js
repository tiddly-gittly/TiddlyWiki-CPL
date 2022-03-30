// Creator: Gk0Wk (https://github.com/Gk0Wk)
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const readlineSync = require("readline-sync");
const { execSync } = require("child_process");
const chalk = require("chalk");
let $tw;

/** 项目路径 */
const repoFolder = path.join(path.dirname(__filename), "..");

/**
 * 执行命令行指令，并打印该指令的结果
 * @param {string} command 要执行的命令
 * @param {ExecSyncOptionsWithStringEncoding} options 执行指令时的附带参数
 * @param {boolean} output 是否输出
 */
function shell(command, options, output) {
  if (options !== undefined) options = {};
  execSync(command, {
    cwd: repoFolder,
    stdio: output ? "inherit" : [("inherit", "ignore", "ignore")],
    ...options,
  });
}

/**
 * 执行命令行指令，并打印该指令的结果，同时忽略任何错误
 * @param {string} command 要执行的命令
 * @param {ExecSyncOptionsWithStringEncoding} options 执行指令时的附带参数
 * @param {boolean} output 是否输出
 */
function shellI(command, options, output) {
  try {
    shell(command, options, output);
  } catch (error) {
    console.error(chalk.red.bold(`[Shell Command Error] ${error}`));
  }
}

/**
 * 从列表中返回第一个满足要求的项，如果没有就返回undefined
 *
 * @param {unknown[]} list 若干项的列表
 * @param {(unknown) => boolean} condition
 * @returns {unknown | undefined}
 */
function findFirstOne(list, condition) {
  const len = list.length;
  for (let i = 0; i < len; i++) {
    if (condition(list[i])) return list[i];
  }
  return undefined;
}

/**
 * 从指定文件获得指定的tiddler
 *
 * @param {string} wikiFile
 * @param {string} tiddlerTitle
 * @returns {$tw.Tiddler}
 */
function getTiddlerFromFile(wikiFile, tiddlerTitle) {
  try {
    const fileMIME = $tw.config.fileExtensionInfo[path.extname(wikiFile)].type;
    const fileText = fs.readFileSync(wikiFile).toString("utf8");
    return findFirstOne(
      $tw.wiki.deserializeTiddlers(fileMIME, fileText, {}),
      (tiddler_) => tiddler_.title === tiddlerTitle
    );
  } catch (e) {
    console.error(chalk.red.bold(e));
    return undefined;
  }
}

function getTiddlersFromFile(wikiFile) {
  try {
    const fileType = path.extname(wikiFile).toLowerCase();
    if (fileType === "" || !(fileType in $tw.config.fileExtensionInfo))
      return [];
    const fileMIME = $tw.config.fileExtensionInfo[fileType].type;
    const fileText = fs.readFileSync(wikiFile).toString("utf8");
    return $tw.wiki.deserializeTiddlers(fileMIME, fileText, {});
  } catch (e) {
    console.error(chalk.red.bold(e));
    return undefined;
  }
}

function saveTiddlersFromFile(wikiFile) {
  getTiddlersFromFile(wikiFile).forEach($tw.wiki.addTiddler);
}

/**
 * 判断是否是安装后需要重新加载页面的插件
 * @param {Record<string, string | number>} pluginTiddler 插件tiddler
 * @returns {boolean} 需要重载则返回true，反之
 */
function ifPluginRequiresReload(pluginTiddler) {
  const shadowTiddlers = JSON.parse(pluginTiddler.text).tiddlers;
  const shadowTitles = Object.keys(shadowTiddlers);
  for (let i = 0, length = shadowTitles.length; i < length; i++) {
    const tiddler = shadowTiddlers[shadowTitles[i]];
    if (
      tiddler.type === "application/javascript" &&
      tiddler["module-type"] !== undefined &&
      tiddler["module-type"] !== ""
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 格式化插件tiddler的名称
 * @param {string} title 插件tiddler的标题
 * @returns {string} 格式化之后的文件名称
 */
function formatTitle(title) {
  return encodeURIComponent(
    title
      .replace("$:/plugins/", "")
      .replace("$:/languages/", "languages_")
      .replace("$:/themes/", "themes_")
      .replace(/[:/<>"\|?*]/g, "_")
  );
}

/**
 * 递归创建文件夹
 * @param {string} dirname 文件夹路径
 * @returns {boolean} 创建成功则返回true
 */
function mkdirsSync(dirname) {
  if (fs.existsSync(dirname)) return true;
  mkdirsSync(path.dirname(dirname));
  return fs.mkdirSync(dirname);
}

function mergeField(fieldName, plugin, info, fallback) {
  const pluginEmpty = !plugin[fieldName] || plugin[fieldName].trim() === "";
  const infoEmpty = !info[fieldName] || info[fieldName].trim() === "";
  if (pluginEmpty && infoEmpty) {
    if (!!fallback && fallback.trim() !== "")
      plugin[fieldName] = info[fieldName] = fallback;
  } else if (pluginEmpty) {
    plugin[fieldName] = info[fieldName];
  } else if (infoEmpty) {
    info[fieldName] = plugin[fieldName];
  }
}

function getReadmeFromPlugin(pluginTiddler) {
  const readmeTiddler = JSON.parse(pluginTiddler.text).tiddlers[
    pluginTiddler.title + "/readme"
  ];
  return readmeTiddler ? readmeTiddler.text : "";
}

const mergingFields = [
  "title",
  "dependents",
  "description",
  "source",
  "parent-plugin",
  "core-version",
  "icon",
];

function mergePluginInfo(pluginTiddler, infoTiddler) {
  let newInfoTiddler = {
    title: infoTiddler["cpl.title"],
    author: infoTiddler["cpl.author"],
    name: infoTiddler["cpl.name"],
    description: infoTiddler["cpl.description"],
    readme: infoTiddler["cpl.readme"],
    version: infoTiddler["cpl.version"],
    "plugin-type": infoTiddler["cpl.type"],
    icon: infoTiddler["cpl.icon"],
    dependents: infoTiddler["cpl.dependents"]
      ? infoTiddler["cpl.dependents"].split("\n").join(" ")
      : "",
    "parent-plugin": infoTiddler["cpl.parent-plugin"],
    "core-version": infoTiddler["cpl.core-version"],
    "requires-reload": ifPluginRequiresReload(pluginTiddler),
  };
  mergeField("version", pluginTiddler, newInfoTiddler, $tw.version);
  mergeField("type", pluginTiddler, newInfoTiddler, "application/json");
  mergeField("plugin-type", pluginTiddler, newInfoTiddler, "plugin");
  mergeField(
    "author",
    pluginTiddler,
    newInfoTiddler,
    pluginTiddler.title.split("/")[2]
  );
  mergeField(
    "name",
    pluginTiddler,
    newInfoTiddler,
    pluginTiddler.title.split("/")[3]
  );
  $tw.utils.each(mergingFields, function (fieldName) {
    mergeField(fieldName, pluginTiddler, newInfoTiddler);
  });
  if (!newInfoTiddler.readme || newInfoTiddler.readme.trim() === "") {
    newInfoTiddler.readme = getReadmeFromPlugin(pluginTiddler);
  }
  if (newInfoTiddler.documentation && newInfoTiddler.documentation !== "")
    newInfoTiddler.readme =
      `<$button class="tc-btn-invisible" message="tm-open-external-window" param="${newInfoTiddler.documentation}">{{$:/core/images/home-button}} <$text text="${newInfoTiddler.documentation}"/></$button><br/>` +
      newInfoTiddler.readme;
  if (newInfoTiddler.source && newInfoTiddler.source !== "")
    newInfoTiddler.readme =
      `<$button class="tc-btn-invisible" message="tm-open-external-window" param="${newInfoTiddler.source}">{{$:/core/images/github}} <$text text="${newInfoTiddler.source}"/></$button><br/>` +
      newInfoTiddler.readme;
  // 改成只保留指定的字段
  const fields = Object.keys(newInfoTiddler);
  for (let i = 0, length = fields.length; i < length; i++) {
    const field = fields[i];
    if (
      newInfoTiddler[field] === undefined ||
      newInfoTiddler[field] === "" ||
      ["source"].indexOf(field) > -1
    )
      delete newInfoTiddler[field];
  }
  return { pluginTiddler, newInfoTiddler };
}

// https://mklauber.github.io/tw5-plugins/library/index.html
function _importLibrary(uri) {
  let distDir = "dist/library";
  const tmp = uri.split("/");
  tmp.pop();
  const baseUri = tmp.join("/");

  try {
    // 下载JSON文件，包含插件的信息
    shellI(
      `wget '${baseUri}'/recipes/library/tiddlers.json -O ${distDir}/tmp/tiddlers.json`
    );
    let pluginsJson = fs.readFileSync(`${distDir}/tmp/tiddlers.json`, "utf-8");
    pluginsJson = JSON.parse(pluginsJson);
    pluginsJson.forEach((plugin) => {
      if ("title" in plugin) {
        _importPlugin(
          `${baseUri}/recipes/library/tiddlers/${encodeURIComponent(
            encodeURIComponent(plugin.title)
          )}.json`,
          plugin.title
        );
      }
    });
  } catch (e) {
    console.error(chalk.red.bold(e));
    return;
  }
}

function importLibrary() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  function questionLoop() {
    rl.question(
      chalk.grey(
        `(must be xxx/index.html, can find in url field of the plugin library tiddler)(${chalk.red(
          "ctrl-D"
        )} to terminate)\n`
      ) + chalk.bold("Library HTML file uri: "),
      (uri) => {
        _importLibrary(uri);
        questionLoop();
      }
    );
  }
  rl.on("close", function () {
    process.exit();
  });
  questionLoop();
}

const fieldConvert = [
  ["title", "cpl.title"],
  ["author", "cpl.author"],
  ["name", "cpl.name"],
  ["description", "cpl.description"],
  ["plugin-type", "cpl.plugin-type"],
  ["source", "cpl.source"],
  ["sourcecode", "cpl.source"],
  ["github", "cpl.source"],
  ["documentation", "cpl.documentation"],
  ["document", "cpl.documentation"],
  ["doc", "cpl.documentation"],
  ["dependents", "cpl.dependents"],
  ["parent-plugin", "cpl.parent-plugin"],
  ["core-version", "cpl.core-version"],
];
const importCache = {};
/**
 * 导入一个插件
 *
 * @param {string} uri
 * @param {string} title
 * @returns
 */
function _importPlugin(uri, title) {
  let distDir = "dist/library";
  if (!$tw) {
    $tw = require("tiddlywiki/boot/boot").TiddlyWiki();
    $tw.boot.argv = ["."];
    $tw.boot.boot();
  }
  mkdirsSync(`${distDir}/tmp`);

  const formatedTitle = formatTitle(title);
  const fileName = formatedTitle + path.extname(uri);
  let pluginFile;
  if (uri in importCache) {
    pluginFile = importCache[uri];
  } else {
    const fileRegExp = new RegExp(formatedTitle + "\\..*");
    pluginFile = findFirstOne(fs.readdirSync(`${distDir}/tmp`), (file) => {
      if (!fileRegExp.test(file)) return false;
      const extname = path.extname(file);
      if (extname === "") return false;
      return extname in $tw.config.fileExtensionInfo;
    });
    if (!pluginFile) shellI(`wget '${uri}' -O ${distDir}/tmp/${fileName}`);
    pluginFile = findFirstOne(fs.readdirSync(`${distDir}/tmp`), (file) => {
      if (!fileRegExp.test(file)) return false;
      const extname = path.extname(file);
      if (extname === "") return false;
      return extname in $tw.config.fileExtensionInfo;
    });
    if (!pluginFile) {
      console.warn(
        chalk.yellow(`[Warning] Cannot find file ${formatedTitle}.*`)
      );
      return;
    }
    importCache[uri] = fileName;
  }

  // 加载、提取插件文件
  const plugin = getTiddlerFromFile(`${distDir}/tmp/${pluginFile}`, title);
  if (!plugin) {
    console.warn(
      chalk.yellow(
        `[Warning] Cannot find tiddler ${title} in file ${pluginFile}.`
      )
    );
    return;
  }
  let pluginInfo = {
    tags: "$:/tags/PluginWiki",
    "cpl.readme": getReadmeFromPlugin(plugin),
    "cpl.uri": uri,
  };
  fieldConvert.forEach((fieldPair) => {
    if (fieldPair[0] in plugin) pluginInfo[fieldPair[1]] = plugin[fieldPair[0]];
  });
  const tmp = $tw.wiki.filterTiddlers(
    `[tag[$:/tags/PluginWiki]cpl.title[${pluginInfo["cpl.title"]}]]`
  );
  if (tmp.length > 0) {
    let answer = readlineSync.question(
      chalk.blue(
        `Plugin ${chalk.bold(
          pluginInfo["cpl.title"]
        )} already exists ${chalk.grey(
          "(as " + tmp[0] + ")"
        )}, should I overwrite it with a new message? [Y/N]\n`
      )
    );
    answer =
      answer.trim() === "" ||
      answer.indexOf("y") !== -1 ||
      answer.indexOf("Y") !== -1;
    if (!answer) return false;
  }

  pluginInfo.title =
    tmp.length > 0
      ? tmp[0]
      : "Plugin_" + $tw.wiki.filterTiddlers("[<now YYYY0MM0DD0mm0ss0XXX>]")[0];
  if (tmp.length > 0) {
    pluginInfo = {
      ...JSON.parse($tw.wiki.getTiddlerAsJson(tmp[0])),
      ...pluginInfo,
    };
  }
  $tw.wiki.addTiddler(pluginInfo);
  console.log(
    chalk.green(
      `Successfully ${
        tmp.length > 0
          ? chalk.yellow.bold.underline("update")
          : chalk.green.bold.underline("add")
      } ${pluginInfo.title}(${chalk.grey(pluginInfo["cpl.title"])}) to cpl.`
    )
  );
  return true;
}

function importPlugin() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  function questionLoop() {
    rl.question(
      chalk.bold("Downloadable URI of plugin") +
        chalk.grey(
          `(.html/.json/.tid etc.)(${chalk.red("ctrl-D")} to terminate)`
        ) +
        chalk.bold(":\n"),
      (uri) => {
        rl.question(
          chalk.bold("Title of the plugin") +
            chalk.grey(
              `(e.g. $:/plugins/tiddlywiki/codemirror)(${chalk.red(
                "ctrl-D"
              )} to terminate)`
            ) +
            chalk.bold(":\n"),
          (title) => {
            _importPlugin(uri.trim(), title.trim());
            questionLoop();
          }
        );
      }
    );
  }
  rl.on("close", function () {
    process.exit();
  });
  questionLoop();
}

/**
 * 构建插件源
 * @param {string} distDir 目标路径，空或者不填则默认为'dist/library'
 * @param {boolean} minify 是否最小化HTML，默认为true
 */
function buildLibrary(distDir, minify) {
  if (typeof distDir !== "string" || distDir.length === 0)
    distDir = "dist/library";
  if (typeof minify !== "boolean") minify = true;

  // 启动TW
  console.log(chalk.grey.bold("Loading plugin informations"));
  if (!$tw) {
    $tw = require("tiddlywiki/boot/boot").TiddlyWiki();
    $tw.boot.argv = ["."];
    $tw.boot.boot();
  }

  // 遍历、下载所有插件
  const pluginsInfo = [];
  const pluginCallbackInfo = {
    title: "$:/temp/tw-cpl/plugin-callback-info",
    text: {},
    type: "application/json",
  };
  const pluginInfoTiddlerTitles = $tw.wiki.filterTiddlers(
    "[all[tiddlers]!is[draft]tag[$:/tags/PluginWiki]]"
  );
  const downloadFileMap = {};
  mkdirsSync(`${distDir}/plugins`); // 插件目标目录
  mkdirsSync(`${distDir}/tmp`); // 临时的插件目录
  shellI(`cp plugin_files/* ${distDir}/tmp/`); // 拷贝本地插件(未在网络上发布的)
  pluginInfoTiddlerTitles.forEach((title) => {
    try {
      const tiddler = $tw.wiki.getTiddler(title).fields;
      // 带有uri，需要下载下来，但是需要是tw支持的格式
      if (
        tiddler["cpl.uri"] &&
        tiddler["cpl.uri"] !== "" &&
        $tw.config.fileExtensionInfo[path.extname(tiddler["cpl.uri"])] &&
        tiddler["cpl.title"] &&
        tiddler["cpl.title"] !== ""
      ) {
        console.log(
          `- Downloading plugin file ${chalk.bold(tiddler["cpl.title"])}`
        );
        const distPluginName =
          formatTitle(tiddler["cpl.title"]) + path.extname(tiddler["cpl.uri"]);
        if (downloadFileMap[tiddler["cpl.uri"]]) {
          shellI(
            `cp ${
              downloadFileMap[tiddler["cpl.uri"]]
            } ${distDir}/tmp/${distPluginName}`
          );
        } else {
          shellI(
            `wget '${tiddler["cpl.uri"]}' -O ${distDir}/tmp/${distPluginName}`
          );
          downloadFileMap[
            tiddler["cpl.uri"]
          ] = `${distDir}/tmp/${distPluginName}`;
        }
      }
    } catch (e) {
      console.error(chalk.red.bold(e));
    }
  });

  // 接下来从tmp/下获取所有的插件
  console.log(chalk.gray.bold("Exporting plugins"));
  const files = fs.readdirSync(`${distDir}/tmp`);
  pluginInfoTiddlerTitles.forEach((title) => {
    const tiddler = JSON.parse($tw.wiki.getTiddlerAsJson(title));
    if (!tiddler["cpl.title"] || tiddler["cpl.title"] === "") {
      console.warn(
        chalk.yellow(
          `[Warning] ${title} missed plugin title, skip this plugin.`
        )
      );
      return;
    }
    try {
      const pluginName = formatTitle(tiddler["cpl.title"]);
      // 找到文件夹下对应的插件文件
      const fileRegExp = new RegExp(pluginName + "\\..*");
      const pluginFile = findFirstOne(files, (file) => {
        if (!fileRegExp.test(file)) return false;
        const extname = path.extname(file);
        if (extname === "") return false;
        return extname in $tw.config.fileExtensionInfo;
      });
      if (!pluginFile) {
        console.warn(
          chalk.yellow(
            `[Warning] Cannot find file ${pluginName}.*, skip this plugin.`
          )
        );
        return;
      }

      // 加载、提取插件文件
      const plugin = getTiddlerFromFile(
        `${distDir}/tmp/${pluginFile}`,
        tiddler["cpl.title"]
      );
      if (!plugin) {
        console.warn(
          chalk.yellow(
            `[Warning] Cannot find tiddler ${tiddler["cpl.title"]} in file ${pluginFile}, skip this plugin.`
          )
        );
        return;
      }

      // 整合信息
      const { pluginTiddler, newInfoTiddler } = mergePluginInfo(
        plugin,
        tiddler
      );
      const infoTiddler = newInfoTiddler;
      // 保存插件
      fs.writeFileSync(
        `${distDir}/plugins/${pluginName}.json`,
        JSON.stringify(pluginTiddler)
      );
      // 登记插件
      pluginsInfo.push(infoTiddler);
      pluginCallbackInfo.text[infoTiddler.title] = `${
        infoTiddler["requires-reload"] === true ? "true" : "false"
      }|${infoTiddler.version}`;
    } catch (e) {
      console.error(chalk.red.bold(e));
    }
  });
  shellI(`rm -rf ${distDir}/tmp`);

  // 生成插件源HTML文件
  console.log(chalk.gray.bold("Generating plugin library file"));
  fs.writeFileSync(
    `${distDir}/index-raw.html`,
    fs
      .readFileSync(`scripts/library.emplate.html`)
      .toString("utf8")
      .replace("'%%plugins%%'", JSON.stringify(pluginsInfo))
  );

  // 生成插件信息反馈
  pluginCallbackInfo.text = JSON.stringify(pluginCallbackInfo.text);
  fs.writeFileSync(
    `${distDir}/callback.tid`,
    "title: $:/temp/tw-cpl/plugin-callback-info\ntype: application/json\n\n" +
      pluginCallbackInfo.text
  );

  // 最小化：HTML
  if (minify) {
    console.log(chalk.gray.bold("Minifying plugin library file"));
    shellI(
      `npx html-minifier-terser -c scripts/html-minifier-terser.config.json -o ${distDir}/index.html ${distDir}/index-raw.html && rm ${distDir}/index-raw.html`
    );
  } else {
    shellI(`mv ${distDir}/index-raw.html ${distDir}/index.html`);
  }
  console.log(chalk.green.bold("CPL generated"));
}

module.exports = {
  build: buildLibrary,
  importPlugin: importPlugin,
  importLibrary: importLibrary,
};
