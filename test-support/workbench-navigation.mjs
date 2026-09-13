export async function openWorkbenchPage(page, name) {
  const nav = page.getByRole('navigation', { name: 'ワークベンチ', exact: true });
  if (['比較・記録', '接続・復旧'].includes(name)) {
    const more = nav.locator('details');
    if (await more.getAttribute('open') === null) await more.locator('summary').click();
  }
  await nav.getByRole('button', { name, exact: true }).click();
}

export async function openSetupDetails(page) {
  await openWorkbenchPage(page, '設定');
  const details = page.locator('.setup-conversation');
  if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
}

export async function openSourceSettings(page) {
  await openWorkbenchPage(page, '設定');
  const details = page.locator('.settings-manual');
  if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
}
