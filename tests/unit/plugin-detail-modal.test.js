const fs = require('fs');
const path = require('path');
const paths = require('../paths');

describe('CPL plugin detail modal wiring', () => {
  const listItemPath = path.join(
    paths.projectRoot,
    'src',
    'CPLPlugin',
    'views',
    'plugins',
    'list-item.tid'
  );
  const modalPath = path.join(
    paths.projectRoot,
    'src',
    'CPLPlugin',
    'templates',
    'modals',
    'plugin-detail.tid'
  );

  test('plugin cards open the metadata modal instead of navigating', () => {
    const listItem = fs.readFileSync(listItemPath, 'utf8');

    expect(listItem).toContain('cpl-plugin-card-open-button');
    expect(listItem).toContain('$:/temp/CPL-Repo/plugin-detail-title');
    expect(listItem).toContain('$message="tm-modal"');
    expect(listItem).toContain(
      '$param="$:/plugins/Gk0Wk/CPL-Repo/templates/modals/plugin-detail"'
    );
    // The card body sets versions via $action-setfield before opening modal
    expect(listItem).toContain('$:/temp/CPL-Repo/plugin-detail-versions');
    expect(listItem).toContain('jsonget[versions]');
    expect(listItem).not.toContain('$action-navigate');
  });

  test('plugin detail modal reads metadata from the current plugin index', () => {
    const modal = fs.readFileSync(modalPath, 'utf8');

    expect(modal).toContain('{{$:/temp/CPL-Repo/plugin-detail-title}}');
    expect(modal).toContain('{$:/temp/CPL-Repo/plugins-index}jsonextract<selectedTitle>');
    expect(modal).toContain('install-plugin-button');
  });

  test('version selector iterates versions from plugin-detail-versions tiddler', () => {
    const modal = fs.readFileSync(modalPath, 'utf8');

    expect(modal).toContain('{$:/temp/CPL-Repo/plugin-detail-versions}jsonindexes[]');
    expect(modal).toContain('cpl-plugin-detail-version-select');
  });
});

describe('CPL plugin database views', () => {
  const homeGalPath = path.join(
    paths.projectRoot,
    'src',
    'CPLPlugin',
    'views',
    'galleries',
    'home.tid'
  );
  const databasePath = path.join(
    paths.projectRoot,
    'src',
    'CPLPlugin',
    'views',
    'plugins',
    'database.tid'
  );

  test('home gallery renders search and paged list', () => {
    const home = fs.readFileSync(homeGalPath, 'utf8');
    expect(home).toContain('cpl-plugin-search');
    expect(home).toContain('paged-plugin-list');
    expect(home).toContain('searchplugin-home');
  });

  test('database view has mirror selector and refresh button', () => {
    const db = fs.readFileSync(databasePath, 'utf8');
    expect(db).toContain('Database Mirror');
    expect(db).toContain('Refresh Database');
    expect(db).toContain('current-static-repo');
  });
});
