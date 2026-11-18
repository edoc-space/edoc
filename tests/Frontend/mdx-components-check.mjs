/** Checks author components on a production page supplied by the shared browser run. */
export async function verifyMdxComponents(page, base = 'http://nginx', screenshots = false) {
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    for (const route of ['/components','/docs/components','/blog/p04','/en/components','/en/docs/components','/en/blog/p04','/components']) {
      const response=await page.goto(base+route);
      if(response.status()!==200) throw new Error(route+': '+response.status());
      const language=route.startsWith('/en/')?'en':'ru';
      await page.locator('[data-pc3="local"]').first().getByText(language+' / provider',{exact:true}).waitFor();
      await page.locator('[data-pc3="package"]').getByText(language+' / provider',{exact:true}).waitFor();
      const first=page.getByRole('button',{name:'local: 0',exact:true});
      await first.click();
      await page.getByRole('button',{name:'local: 1',exact:true}).waitFor();
      await page.getByRole('button',{name:'independent: 0',exact:true}).waitFor();
      await page.getByRole('button',{name:'package: 0',exact:true}).click();
      await page.getByRole('button',{name:'package: 1',exact:true}).waitFor();
      const colors=await page.locator('[data-pc3]').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).borderTopColor));
      if(colors.join('|')!=='rgb(98, 63, 174)|rgb(98, 63, 174)|rgb(39, 124, 69)') throw new Error(route+': CSS '+colors);
      await page.getByRole('button',{name:'independent: 0',exact:true}).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'independent: 1',exact:true}).waitFor();
    }
    if (screenshots) {
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/evidence/pc3-components-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'/evidence/pc3-components-desktop.png',fullPage:true});
    }
    if(errors.length) throw new Error(errors.join('\\n'));
    console.log('PC3 browser: pages/docs/private blog, RU/EN, repeated mount, independent hooks, shared React/context/provider, local/package CSS and keyboard passed');
}
