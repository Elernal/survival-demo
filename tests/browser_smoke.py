"""Real Chromium integration tests using only normal keyboard/touch/UI actions.

The virtual clock accelerates the two-minute shelter day; no internal game state
is changed. Artwork requests and visible shelter time verify lifecycle reuse.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import re
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def state(page):
    return page.locator('html').get_attribute('data-game-state')


def clock_minute(page):
    text = page.locator('#shelterClock').inner_text()
    hour, minute = map(int, re.search(r'(\d{2}):(\d{2})', text).groups())
    return hour * 60 + minute


def enter_and_build(page):
    page.wait_for_function("document.documentElement.dataset.gameState==='Ready'")
    page.clock.install()
    page.locator('#startBtn').click()
    assert state(page) == 'Playing'
    assert page.locator('#overlay').is_hidden()
    assert page.locator('#shelterHUD').is_visible()
    assert '第 1 天' in page.locator('#shelterClock').inner_text()
    assert page.locator('#shelterDepart').is_disabled()
    page.locator('#shelterBuild').click()
    assert '工作台修复完成' in page.locator('#shelterTip').inner_text()
    assert '零件 1' in page.locator('#shelterInventory').inner_text()
    page.locator('#shelterBuild').click()
    assert '床铺修复完成' in page.locator('#shelterTip').inner_text()
    assert '零件 0' in page.locator('#shelterInventory').inner_text()
    # Visible time must progress at one simulation's rate, even after pause/resume.
    for _ in range(3):
        page.locator('#pauseBtn').click()
        assert state(page) == 'Paused'
        page.locator('#startBtn').click()
        assert state(page) == 'Playing'
    before = clock_minute(page)
    page.clock.run_for(2000)
    assert 9 <= clock_minute(page) - before <= 11, 'Shelter clock suggests duplicate/stopped RAF'


def touch_move(page, context, duration=700):
    cdp = context.new_cdp_session(page)
    rect = page.locator('#stick').bounding_box()
    x = rect['x'] + rect['width'] * .85
    y = rect['y'] + rect['height'] / 2
    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
    page.clock.run_for(duration)
    cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel','touchPoints':[]})
    assert page.locator('#knob').evaluate('(e)=>e.style.transform') == 'translate(0px, 0px)'
    return cdp


def depart_at_night(page):
    assert page.locator('#shelterDepart').is_disabled()
    page.clock.run_for(120100)
    assert '18:00' in page.locator('#shelterClock').inner_text()
    assert not page.locator('#shelterDepart').is_disabled()
    page.locator('#shelterDepart').click()
    assert page.locator('#shelterMap').is_visible()
    page.locator('#shelterBack').click()
    assert page.locator('#shelterMap').is_hidden()
    page.locator('#shelterDepart').click()
    page.locator('#shelterGo').click()
    assert page.locator('#shelterHUD').is_hidden()
    assert page.locator('#shelterMap').is_hidden()
    assert state(page) == 'Playing'


def mission_and_return(page, travel_steps=26, food_collect_step=6):
    page.keyboard.down('KeyD')
    for i in range(travel_steps + 6):
        page.keyboard.press('KeyK')
        page.keyboard.press('KeyR')
        page.clock.run_for(400)
        if i == food_collect_step:
            page.keyboard.press('KeyF')
        if '急救物资箱' in page.locator('#hint').inner_text():
            break
    page.keyboard.up('KeyD')
    page.keyboard.press('KeyF')
    page.clock.run_for(20)
    page.screenshot(path=str(ROOT / 'tests' / 'smoke-clinic.png'))
    assert '安全撤离' in page.locator('#task').inner_text(), {
        'state':state(page),'scene':page.locator('html').get_attribute('data-scene'),
        'task':page.locator('#task').inner_text(),'zone':page.locator('#zoneName').inner_text(),
        'hp':page.locator('#hpText').inner_text(),'ammo':page.locator('#ammoText').inner_text(),'hint':page.locator('#hint').inner_text(),
        'toast':page.locator('#toast').inner_text()}
    page.keyboard.down('KeyA')
    page.clock.run_for(10400)
    page.keyboard.up('KeyA')
    page.keyboard.press('KeyF')
    page.clock.run_for(20)
    assert state(page) == 'Playing', 'Extraction must continue the single lifecycle in shelter'
    assert page.locator('#shelterHUD').is_visible()
    assert '第 2 天' in page.locator('#shelterClock').inner_text()
    assert '清晨返回基地' in page.locator('#shelterTip').inner_text()
    assert page.locator('#shelterDepart').is_disabled()
    assert page.locator('#overlay').is_hidden()
    # Show that rendering/simulation continue after return, at the original rate.
    before = clock_minute(page)
    page.clock.run_for(2000)
    assert 9 <= clock_minute(page) - before <= 11, 'Return stopped or duplicated the RAF simulation'
    # Move by ordinary controls to the cabinet, then use the in-game interaction.
    page.keyboard.down('KeyA')
    page.clock.run_for(5000)
    page.keyboard.up('KeyA')
    page.keyboard.down('KeyD')
    page.clock.run_for(780)
    page.keyboard.up('KeyD')
    page.keyboard.press('KeyF')
    assert '储物柜' in page.locator('#shelterTip').inner_text(), 'Movement after return failed'


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            for name, width, height, touch in [
                ('desktop',1280,720,False), ('phone-landscape',844,390,True),
                ('tablet',1024,768,True), ('phone-portrait',390,844,True),
            ]:
                context = browser.new_context(viewport={'width':width,'height':height}, has_touch=touch, is_mobile=touch)
                page = context.new_page()
                errors, art_requests = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: art_requests.append(request.url) if '/assets/art/' in request.url else None)
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                enter_and_build(page)
                ready_requests = len(art_requests)
                # Shelter movement is proved through an interaction at the cabinet.
                page.keyboard.down('KeyA');page.clock.run_for(700);page.keyboard.up('KeyA')
                page.keyboard.press('KeyF')
                assert '储物柜' in page.locator('#shelterTip').inner_text()
                if touch:
                    touch_move(page, context, duration=1050)
                    page.locator('#btnInteract').tap()
                    assert '设施已经修复' in page.locator('#shelterTip').inner_text(), 'Shelter touch movement/interact failed'
                page.screenshot(path=str(ROOT / 'tests' / f'smoke-{name}-shelter.png'))
                full_flow = name in ['desktop', 'phone-landscape']
                if full_flow:
                    depart_at_night(page)
                    assert len(art_requests) == ready_requests, 'Departure reloaded artwork'
                if not touch:
                    mission_and_return(page)
                    assert len(art_requests) == ready_requests, 'Returning reloaded artwork'
                    page.screenshot(path=str(ROOT / 'tests' / 'smoke-day2.png'))
                    page.keyboard.down('KeyD')
                    page.evaluate("window.dispatchEvent(new Event('blur'))")
                    assert state(page) == 'Paused'
                elif full_flow:
                    cdp = context.new_cdp_session(page)
                    rect = page.locator('#stick').bounding_box()
                    x=rect['x']+rect['width']*.85;y=rect['y']+rect['height']/2
                    fire=page.locator('#btnFire').bounding_box()
                    fx=fire['x']+fire['width']/2;fy=fire['y']+fire['height']/2
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
                    page.clock.run_for(1500)
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1},{'x':fx,'y':fy,'id':2}]})
                    page.clock.run_for(800)
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel','touchPoints':[]})
                    assert page.locator('#ammoText').inner_text() != '06 / 18'
                    assert '废弃住宅' in page.locator('#zoneName').inner_text()
                    assert page.locator('#knob').evaluate('(e)=>e.style.transform') == 'translate(0px, 0px)'
                    assert page.locator('.pressed').count() == 0
                    page.screenshot(path=str(ROOT / 'tests' / f'smoke-{name}-explore.png'))
                assert not errors, errors
                results.append({'viewport':name,'result':'passed','build_workbench_and_bed':True,'night_departure':full_flow,'art_requests':ready_requests,'js_errors':errors})
                context.close()
            browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    run()
