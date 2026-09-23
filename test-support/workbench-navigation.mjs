export async function openWorkbenchPage(page, name) {
  if (name === '比較・記録') name = '記録・比較';
  const nav = page.getByRole('navigation', { name: /^(?:ワークベンチ|Workbench)$/ });
  if (['接続・復旧', '記録・比較', '外観', '設定', 'Connection & recovery', 'Work records', 'Comparisons & records', 'Appearance', 'Settings'].includes(name)) {
    const more = nav.locator('details');
    if (await more.getAttribute('open') === null) await more.locator('summary').click();
  }
  await nav.getByRole('button', { name, exact: true }).click();
}

export async function openReplayWorkbench(page) {
  await openWorkbenchPage(page, '記録・比較');
  await page.getByRole('button', { name: '同じお題で試す', exact: true }).click();
}

export async function openSetupDetails(page) {
  await openWorkbenchPage(page, '設定');
  const details = page.locator('.setup-conversation');
  if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
}

export async function openSourceSettings(page) {
  await openWorkbenchPage(page, '設定');
  if (await page.locator('.initial-setup').count()) return;
  const details = page.locator('.settings-manual');
  if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
}
