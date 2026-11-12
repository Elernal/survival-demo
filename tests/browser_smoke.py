"""Real Chromium tests; no game state mutation or test-only gameplay API."""
from pathlib import Path
import json, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',8765),partial(SimpleHTTPRequestHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for name,width,height,touch in [('desktop',1280,720,False),('phone-landscape',844,390,True),('tablet',1024,768,True),('phone-portrait',390,844,True)]:
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
  page=context.new_page(); errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.goto('http://127.0.0.1:8765/')
  page.wait_for_function("document.documentElement.dataset.gameState==='Ready'")
  page.clock.install()
  page.locator('#startBtn').click()
  assert page.locator('#overlay').is_hidden()
  assert page.locator('html').get_attribute('data-game-state')=='Playing'
  for _ in range(4):
   page.locator('#pauseBtn').click(); assert page.locator('html').get_attribute('data-game-state')=='Paused'
   page.locator('#startBtn').click()
  if not touch:
   # Move through the actual mission, firing and reloading using normal keys.
   page.keyboard.down('KeyD')
   for i in range(26):
    page.keyboard.press('KeyK');page.keyboard.press('KeyR');page.clock.run_for(400)
    if i==6:page.keyboard.press('KeyF')
   page.keyboard.up('KeyD');page.keyboard.press('KeyF')
   assert '安全撤离' in page.locator('#task').inner_text(),page.locator('#task').inner_text()
   page.keyboard.down('KeyA');page.clock.run_for(10400);page.keyboard.up('KeyA');page.keyboard.press('KeyF')
   assert page.locator('html').get_attribute('data-game-state')=='Completed'
   page.locator('#startBtn').click();page.clock.run_for(20)
   assert '寻找医疗物资' in page.locator('#task').inner_text()
   page.keyboard.press('KeyJ');page.keyboard.press('KeyK');page.keyboard.press('KeyR')
   # Blur must pause and release held movement.
   page.keyboard.down('KeyD');page.evaluate("window.dispatchEvent(new Event('blur'))")
   assert page.locator('html').get_attribute('data-game-state')=='Paused'
  else:
   cdp=context.new_cdp_session(page)
   rect=page.locator('#stick').bounding_box();x=rect['x']+rect['width']*.85;y=rect['y']+rect['height']/2
   fire=page.locator('#btnFire').bounding_box();fx=fire['x']+fire['width']/2;fy=fire['y']+fire['height']/2
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
   page.clock.run_for(1500)
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1},{'x':fx,'y':fy,'id':2}]})
   page.clock.run_for(800)
   cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
   assert page.locator('#ammoText').inner_text()!='06 / 18'
   assert page.locator('#knob').evaluate('(e)=>e.style.transform')=='translate(0px, 0px)'
   assert page.locator('.pressed').count()==0
  page.screenshot(path=str(root/'tests'/f'{name}.png'))
  assert not errors,errors
  results.append({'device':name,'result':'passed','errors':errors})
  context.close()
 browser.close()
server.shutdown()
print(json.dumps(results,indent=2))
