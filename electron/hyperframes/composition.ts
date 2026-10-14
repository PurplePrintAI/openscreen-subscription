import { type MotionScene, motionSceneSchema } from "../../src/lib/hyperframes";

export function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"']/g,
		(char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
	);
}

/** Studio-authored template only. Never accepts a script, HTML, URL or selector
 * from the renderer/model. Local media and GSAP are copied into each job folder. */
export function buildMotionComposition(input: MotionScene): string {
	const scene = motionSceneSchema.parse(input);
	const title = escapeHtml(scene.title);
	const subtitle = escapeHtml(scene.subtitle);
	return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=1920,height=1080">
<title>${title}</title><script src="./assets/gsap.min.js"></script>
<style>
@font-face{font-family:"Malgun Gothic";src:local("Malgun Gothic")}
*{box-sizing:border-box}body{margin:0;background:#111116;color:#f4f4f5;font-family:Arial,"Malgun Gothic",sans-serif;word-break:keep-all}
#main{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(ellipse at 83% 25%,#282039 0,transparent 60%),#111116}
.clip{position:absolute;inset:0}#line{position:absolute;left:108px;top:110px;width:68px;height:7px;background:#a78bfa;border-radius:9px}
#title{position:absolute;left:108px;top:220px;width:950px;font-size:76px;line-height:1.25;letter-spacing:-2px;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
#subtitle{position:absolute;left:108px;top:510px;width:820px;font-size:34px;line-height:1.6;color:#c4c4cc;margin:0;overflow-wrap:anywhere}
#panels{position:absolute;left:1100px;top:255px;width:700px;display:grid;gap:24px}
.panel{border:1px solid #4c435e;background:#211d2b;padding:38px 40px;border-radius:24px;font-size:35px;line-height:1.4}
.panel span{display:block;font-size:20px;letter-spacing:3px;color:#a78bfa;margin-bottom:8px}
#footnote{position:absolute;left:108px;bottom:74px;font-size:22px;color:#a1a1aa}
#progress{position:absolute;left:108px;bottom:42px;height:3px;width:1704px;background:#a78bfa;transform-origin:left center}
video{position:absolute;left:850px;top:100px;width:960px;height:810px;object-fit:contain;border-radius:24px;background:#09090b}
.with-video #title{width:690px;font-size:62px}.with-video #subtitle{width:620px;font-size:30px;top:535px}
</style></head><body>
<div id="main" data-composition-id="main" data-start="0" data-duration="${scene.durationSec}" data-width="1920" data-height="1080" data-fps="30">
<section id="scene" class="${scene.source ? "with-video" : ""}">
<h1 id="title">${title}</h1><p id="subtitle">${subtitle}</p>
${scene.source ? `<video id="footage" src="./assets/source.mp4" data-start="0" data-duration="${scene.durationSec}" data-media-start="${scene.source.startSec}" data-volume="0" muted playsinline></video>` : `<div id="panels"><div id="validate" class="panel"><span>01 / VALIDATE</span>로컬 구성 확인</div><div id="render" class="panel"><span>02 / RENDER</span>프레임 단위 렌더</div><div id="edit" class="panel"><span>03 / EDIT</span>Studio 타임라인 연결</div></div>`}
${scene.source ? "" : '<div id="footnote">제품 데모가 아닌 연결 검증용 장면</div>'}<div id="progress"></div>
</section></div><script>
const timeline=gsap.timeline({paused:true});
timeline.fromTo('#title',{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:'power3.out'},0.35);
timeline.fromTo('#subtitle',{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:'power2.out'},0.9);
${scene.source ? `timeline.fromTo('#footage',{opacity:0,scale:0.97},{opacity:1,scale:1,duration:1,ease:'power2.out'},0.8);` : `timeline.fromTo('.panel',{opacity:0,y:22},{opacity:1,y:0,duration:0.7,stagger:0.8,ease:'power2.out'},1.5);`}
timeline.fromTo('#progress',{scaleX:0},{scaleX:1,duration:${scene.durationSec},ease:'none'},0);
timeline.to('#scene',{opacity:0,duration:0.5},${scene.durationSec - 0.5});
window.__timelines={main:timeline};
</script></body></html>`;
}
