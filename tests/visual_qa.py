"""Real Chromium visual/resource QA for shelter + exploration.

Uses normal UI/keyboard actions and virtual time for the daytime transition.
Wall-time rAF cadence is measured on an isolated headless Chromium page and is
not an estimate of iOS/Android hardware performance.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import statistics
import threading
from playwright.sync_api import sync_playwright
from browser_smoke import enter_and_build, depart_at_night, mission_and_return, state

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    results=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            for name,width,height,touch in [
                ('desktop',1280,720,False),('phone-landscape',844,390,True),
                ('phone-portrait',390,844,True),('tablet',1024,768,True),
            ]:
                context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
                page=context.new_page()
                errors,requests,bad_art=[],[],[]
                page.on('pageerror',lambda error: errors.append(str(error)))
                page.on('request',lambda request: requests.append(request.url) if '/assets/art/' in request.url else None)
                page.on('response',lambda response: bad_art.append({'url':response.url,'status':response.status}) if '/assets/art/' in response.url and response.status!=200 else None)
                page.goto(origin)
                page.wait_for_function("document.documentElement.dataset.gameState==='Ready'")
                assert page.evaluate('Boolean(window.EmberScene?.ready)')
                assert page.evaluate('Boolean(window.EmberCharacters?.ready)')
                box=page.locator('#startBtn').bounding_box()
                assert box and box['x']>=0 and box['y']>=0 and box['y']+box['height']<=height,box
                for filename in ['scene-west.webp','scene-east.webp','scene-shelter.webp','characters.webp']:
                    assert any(filename in url for url in requests),f'Missing preloaded artwork: {filename}'
                page.screenshot(path=str(ROOT/'tests'/f'visual-{name}-title.png'))
                ready_requests=len(requests)
                enter_and_build(page)
                assert len(requests)==ready_requests,'Starting/building reloaded artwork'
                page.clock.run_for(20)
                page.screenshot(path=str(ROOT/'tests'/f'visual-{name}-shelter.png'))
                if name=='desktop':
                    depart_at_night(page)
                    assert len(requests)==ready_requests,'Departure reloaded artwork'
                    page.keyboard.down('KeyD')
                    for _ in range(10):
                        page.keyboard.press('KeyK');page.keyboard.press('KeyR');page.clock.run_for(400)
                    page.keyboard.up('KeyD')
                    page.screenshot(path=str(ROOT/'tests'/'visual-desktop-playing.png'))
                    mission_and_return(page,travel_steps=16,food_collect_step=None)
                    assert len(requests)==ready_requests,'Mission/return reloaded artwork'
                    page.screenshot(path=str(ROOT/'tests'/'visual-desktop-day2.png'))
                assert not errors,errors
                assert not bad_art,bad_art
                results.append({'viewport':name,'result':'passed','art_requests_at_ready':ready_requests,'shelter_build':True,'mission_and_day2':name=='desktop','js_errors':errors})
                context.close()

            # Isolated real-time page avoids changing clock bases while playing.
            context=browser.new_context()
            page=context.new_page();page.goto(origin)
            page.wait_for_function("document.documentElement.dataset.gameState==='Ready'")
            page.locator('#startBtn').click()
            intervals=page.evaluate('''() => new Promise(resolve=>{
                const result=[];let previous=performance.now();const until=previous+1800;
                function frame(now){result.push(now-previous);previous=now;if(now<until)requestAnimationFrame(frame);else resolve(result.slice(1));}
                requestAnimationFrame(frame);
            })''')
            assert intervals
            results.append({'case':'headless-real-time-shelter','median_raf_ms':round(statistics.median(intervals),2),'p95_raf_ms':round(sorted(intervals)[int(len(intervals)*.95)],2),'real_mobile_benchmark':False})
            context.close()

            context=browser.new_context();page=context.new_page();errors=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.route('**/assets/art/**',lambda route:route.abort())
            page.goto(origin)
            page.wait_for_function("document.documentElement.dataset.gameState==='Ready'")
            assert not page.evaluate('Boolean(window.EmberScene?.ready)')
            assert '基础画面' in page.locator('#loadStatus').inner_text()
            page.locator('#startBtn').click()
            assert state(page)=='Playing'
            assert page.locator('#shelterHUD').is_visible()
            page.screenshot(path=str(ROOT/'tests'/'visual-art-fallback.png'))
            assert not errors,errors
            results.append({'case':'all-art-routes-blocked','result':'passed','js_errors':errors})
            context.close();browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results,indent=2))

if __name__=='__main__':
    run()
