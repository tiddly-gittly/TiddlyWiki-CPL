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
    expect(listItem).not.toContain('$action-navigate');
  });

  test('plugin detail modal reads metadata from the current plugin index', () => {
    const modal = fs.readFileSync(modalPath, 'utf8');

    expect(modal).toContain('{{$:/temp/CPL-Repo/plugin-detail-title}}');
    expect(modal).toContain('{$:/temp/CPL-Repo/plugins-index}jsonextract<selectedTitle>');
    expect(modal).toContain('install-plugin-button');
  });

  test('plugin detail modal should include a version selector for historical versions', () => {
    const modal = fs.readFileSync(modalPath, 'utf8');

    expect(modal).toContain('cpl-plugin-detail-version-select');
    expect(modal).toContain('jsonget[versions]');
    expect(modal).toContain('selectedVersion');
    expect(modal).toContain(
      '$:/state/CPL-Repo/plugin-detail-version'
    );
  });
});
