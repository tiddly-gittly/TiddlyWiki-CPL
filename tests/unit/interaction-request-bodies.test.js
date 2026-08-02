const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('../paths');

const RESULT_PREFIX = 'CPL_INTERACTION_RESULT=';

function probeRequestBodies() {
  const script = [
    "const path = require('path');",
    "const { TiddlyWiki } = require('tiddlywiki');",
    "const runtime = TiddlyWiki();",
    "runtime.boot.argv = [path.resolve('wiki')];",
    "runtime.boot.boot();",
    "const wiki = runtime.wiki;",
    "const run = (filter, variables = {}) => wiki.filterTiddlers(filter, { getVariable: name => variables[name] ?? '' })[0];",
    "const authData = JSON.stringify({ authenticated: true, user: { username: 'linonetwo', avatar: 'https://avatars.example/user.png' } });",
    "const user = JSON.parse(run('[<data>jsonextract[user]]', { data: authData }));",
    "const draftText = 'Hello [[CPL]] \"quoted\"\\n<$text text=\"widget\"/>';",
    "const comment = JSON.parse(run('[[{}]jsonset[content],<draftText>]', { draftText }));",
    "const description = 'Works except with the routing plugin.';",
    "let minimalBody = run('[[{}]jsonset[description],<description>]', { description });",
    "minimalBody = run('[<twVersionMin>!is[blank]then<requestBody>jsonset[twVersionMin],<twVersionMin>] [<twVersionMin>is[blank]then<requestBody>] +[first[]]', { requestBody: minimalBody, twVersionMin: '' });",
    "const minimalCompatibility = JSON.parse(minimalBody);",
    "let completeBody = run('[[{}]jsonset[description],<description>]', { description });",
    "completeBody = run('[<requestBody>jsonset[twVersionMin],<twVersionMin>]', { requestBody: completeBody, twVersionMin: '5.2.0' });",
    "completeBody = run('[<requestBody>jsonset[twVersionMax],<twVersionMax>]', { requestBody: completeBody, twVersionMax: '5.4.1' });",
    "const conflictJson = run('[[{}]jsonset[pluginTitle],<conflictPlugin>jsonset[description],<conflictDescription>]', { conflictPlugin: 'linonetwo/tidgi-routing-chain', conflictDescription: 'Toolbar conflict' });",
    "completeBody = run('[<requestBody>jsonset:array[conflictingPlugins]jsonset:json[conflictingPlugins],[0],<conflictJson>]', { requestBody: completeBody, conflictJson });",
    "const completeCompatibility = JSON.parse(completeBody);",
    "console.log('CPL_INTERACTION_RESULT=' + JSON.stringify({ user, draftText, comment, minimalCompatibility, completeCompatibility }));",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: paths.projectRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  const resultLine = output
    .split(/\r?\n/)
    .find(line => line.startsWith(RESULT_PREFIX));

  if (!resultLine) {
    throw new Error('Interaction probe did not return a result:\n' + output);
  }
  return JSON.parse(resultLine.slice(RESULT_PREFIX.length));
}

describe('CPL interaction request bodies', () => {
  let result;

  beforeAll(() => {
    result = probeRequestBodies();
  }, 40000);

  test('extracts the authenticated GitHub user as a JSON object', () => {
    expect(result.user).toEqual({
      username: 'linonetwo',
      avatar: 'https://avatars.example/user.png',
    });
  });

  test('serializes comment wikitext without treating it as a tiddler title', () => {
    expect(result.comment).toEqual({ content: result.draftText });
  });

  test('serializes minimal and complete compatibility reports', () => {
    expect(result.minimalCompatibility).toEqual({
      description: 'Works except with the routing plugin.',
    });
    expect(result.completeCompatibility).toEqual({
      description: 'Works except with the routing plugin.',
      twVersionMin: '5.2.0',
      twVersionMax: '5.4.1',
      conflictingPlugins: [
        {
          pluginTitle: 'linonetwo/tidgi-routing-chain',
          description: 'Toolbar conflict',
        },
      ],
    });
  });

  test('templates use the validated JSON filters', () => {
    const comments = fs.readFileSync(
      path.join(paths.projectRoot, 'src/CPLPlugin/views/plugins/comments.tid'),
      'utf8'
    );
    const stats = fs.readFileSync(
      path.join(paths.projectRoot, 'src/CPLPlugin/views/plugins/stats.tid'),
      'utf8'
    );
    const authState = fs.readFileSync(
      path.join(paths.projectRoot, 'src/CPLPlugin/background-actions/auto-fetch-auth-state.tid'),
      'utf8'
    );

    expect(comments).toContain('body={{{ [[{}]jsonset[content],<draftText>] }}}');
    expect(comments).not.toContain('<draftText>get[text]jsonstringify');
    expect(stats).toContain('body=<<requestBody>>');
    expect(stats).not.toContain('addprefix[{"description":]');
    expect(authState).toContain('[<data>jsonextract[user]else[{}]]');
  });
});
