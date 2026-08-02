const { execFileSync } = require('child_process');
const paths = require('../paths');

const RESULT_PREFIX = 'CPL_RENDER_RESULT=';

function renderPluginView() {
  const script = String.raw`
const path = require('path');
const { TiddlyWiki } = require('tiddlywiki');

const runtime = TiddlyWiki();
runtime.boot.argv = [path.resolve('wiki')];
runtime.boot.boot();

const wiki = new runtime.Wiki();
for (const title of runtime.wiki.filterTiddlers('[all[shadows+tiddlers]]')) {
  wiki.addTiddler(runtime.wiki.getTiddler(title));
}

for (const fields of [
  { title: '$:/temp/CPL-Repo/server-type', text: 'server' },
  { title: '$:/temp/CPL-Server/user-status', text: 'authenticated' },
  { title: '$:/temp/CPL-Server/user', text: JSON.stringify({ username: 'linonetwo', avatar: 'https://avatars.example/user.png' }), type: 'application/json' },
  { title: '$:/temp/CPL-Server/github-client-id', text: 'test-client-id' },
  { title: '$:/temp/CPL-Server/comments/$:/plugins/linonetwo/tidgi-routing-chain', text: JSON.stringify({ comments: [{ id: 'comment-render-test', username: 'render-user', avatar: '', content: 'Rendered comment body', status: 'approved', createdAt: '2026-08-02T00:00:00.000Z' }] }), type: 'application/json' },
  { title: '$:/state/CPL-Repo/compatibility-panel/$:/plugins/linonetwo/tidgi-routing-chain', text: 'open' },
  { title: '$:/temp/CPL-Server/compatibility/$:/plugins/linonetwo/tidgi-routing-chain', text: JSON.stringify({ reports: [{ id: 'compat-render-test', reporterUsername: 'compat-render-user', twVersionMin: '5.3.0', twVersionMax: '5.4.1', conflictingPlugins: [{ pluginTitle: 'conflict/plugin', description: 'Conflict' }], description: 'Rendered compatibility report', createdAt: '2026-08-02T00:00:00.000Z' }] }), type: 'application/json' },
]) {
  wiki.addTiddler(new runtime.Tiddler(fields));
}

const pluginTitle = 'linonetwo/tidgi-routing-chain';
const detailTemplate = 'CPL PluginWiki View Template';
const commentsTemplate = '$:/plugins/Gk0Wk/CPL-Repo/views/plugins/comments';
const statsTemplate = '$:/plugins/Gk0Wk/CPL-Repo/views/plugins/stats';
const viewTemplates = wiki.filterTiddlers(
  '[all[shadows+tiddlers]tag[$:/tags/ViewTemplate]!is[draft]]'
);
const html = wiki.renderTiddler('text/html', '$:/core/ui/ViewTemplate', {
  variables: { currentTiddler: pluginTitle },
});

const leakedParseText = [];
for (const title of [detailTemplate, commentsTemplate, statsTemplate]) {
  const parsed = wiki.parseTiddler(title);
  (function visit(nodes) {
    for (const node of nodes || []) {
      if (
        node.type === 'text' &&
        /<\/(?:\$[a-z-]+|div|span|p)>/i.test(node.text || '')
      ) {
        leakedParseText.push({ title, text: node.text });
      }
      visit(node.children);
    }
  })(parsed && parsed.tree);
}

const count = needle => html.split(needle).length - 1;
const result = {
  order: {
    detail: viewTemplates.indexOf(detailTemplate),
    comments: viewTemplates.indexOf(commentsTemplate),
    stats: viewTemplates.indexOf(statsTemplate),
  },
  detailOccurrences: count('class="cpl-plugin-thanks"'),
  content: {
    author: /Author: LinOnetwo|作者: LinOnetwo/.test(html),
    category: /Category: Functional|类别: 功能性/.test(html),
    source: html.includes(
      'https://github.com/tiddly-gittly/tiddlywiki-plugins/tree/master/src/tidgi-routing-chain'
    ),
    readmeIntroduction: html.includes('Shows a') && html.includes('ViewToolbar'),
    requirements: html.includes('Requirements'),
    usage: html.includes('Usage'),
    config: html.includes('Config'),
    thanks: /Specially thanks to|特别鸣谢/.test(html),
    related: /Author's other plugins|作者的其他插件/.test(html),
    comments: /Comments|评论/.test(html),
    stats: /downloads|下载/.test(html),
  },
  authUi: {
    username: html.includes('linonetwo'),
    avatar: html.includes('https://avatars.example/user.png'),
    logoutButton: html.includes('class="cpl-comment-logout-button"'),
    invisibleLogout: html.includes('tc-btn-invisible cpl-comment-logout-button'),
    commentUsername: html.includes('render-user'),
    commentBody: html.includes('Rendered comment body'),
    emptyCommentState: html.includes('No comments yet. Be the first!') || html.includes('暂无评论，来发表第一条吧！'),
    compatibilityReporter: html.includes('compat-render-user'),
    compatibilityDescription: html.includes('Rendered compatibility report'),
  },
  leakedParseText,
  escapedClosingTag: /&lt;\/(?:\$[a-z-]+|div|span|p)&gt;/i.test(html),
  literalWidgetClosingTag: /<\/\$[a-z-]+>/i.test(html),
};

console.log('${RESULT_PREFIX}' + JSON.stringify(result));
`;

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: paths.projectRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  const resultLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(RESULT_PREFIX));

  if (!resultLine) {
    throw new Error(`Render probe did not return a result:\n${output}`);
  }
  return JSON.parse(resultLine.slice(RESULT_PREFIX.length));
}

describe('CPL plugin metadata rendering', () => {
  let result;

  beforeAll(() => {
    result = renderPluginView();
  }, 40000);

  test('uses the detail view template before comments and stats', () => {
    expect(result.order.detail).toBeGreaterThanOrEqual(0);
    expect(result.order.detail).toBeLessThan(result.order.comments);
    expect(result.order.detail).toBeLessThan(result.order.stats);
    expect(result.detailOccurrences).toBe(1);
  });

  test('renders plugin fields and key README sections', () => {
    expect(result.content).toEqual({
      author: true,
      category: true,
      source: true,
      readmeIntroduction: true,
      requirements: true,
      usage: true,
      config: true,
      thanks: true,
      related: true,
      comments: true,
      stats: true,
    });
  });

  test('renders the authenticated username and a visible logout button', () => {
    expect(result.authUi).toEqual({
      username: true,
      avatar: true,
      logoutButton: true,
      invisibleLogout: false,
      commentUsername: true,
      commentBody: true,
      emptyCommentState: false,
      compatibilityReporter: true,
      compatibilityDescription: true,
    });
  });

  test('does not leak widget or XML-style closing tags', () => {
    expect(result.leakedParseText).toEqual([]);
    expect(result.escapedClosingTag).toBe(false);
    expect(result.literalWidgetClosingTag).toBe(false);
  });
});
