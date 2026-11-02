// Exercise the local renderer without downloading public map tiles in automated suites.
// This deliberately blank style is a test fixture, not evidence of live street rendering.
export async function stubMapTiles(context) {
 await context.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f2f3f0'}}]}}));
}
