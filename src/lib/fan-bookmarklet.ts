// 북마클릿 본문 — 사용자가 in.naver.com/[본인 ID] 페이지에서 클릭하면 실행됨
// 빌드 변환 영향을 받지 않도록 raw 문자열로 보관한다.
//
// 동작:
// 1) window.__PRELOADED_STATE__에서 spaceId/urlId 추출
// 2) /home/api/v2/spaces/{spaceId}/subscribes/{followers,following} 페이징 fetch (네이버 자체 쿠키 자동 인증)
// 3) 결과를 정규화해 JSON으로 만들어 clipboard에 복사
// 4) ninfle.kr/my/fans/sync 페이지의 textarea에 붙여넣어 업로드

const SCRIPT = `
(async function(){
  try {
    var state = window.__PRELOADED_STATE__;
    var sp = state && state.space && state.space.data ? state.space.data : null;
    var spaceId = sp && sp.id;
    var urlId = (sp && sp.urlId) || (location.pathname.split('/').filter(Boolean)[0]);
    if (!spaceId) {
      alert('이 페이지에서는 정보를 가져올 수 없습니다.\\n\\nhttps://in.naver.com/[내 ID] (본인 인플루언서 홈)에서 다시 클릭하세요.');
      return;
    }

    async function fetchAll(path, type) {
      var items = [];
      var cursor = null;
      var safety = 0;
      var isFollowers = type === 'followers';
      while (safety < 200) {
        safety++;
        var url = new URL('https://gw.in.naver.com' + path);
        url.searchParams.set('limit', '100');
        url.searchParams.set('sort', 'RECENT');
        if (isFollowers) url.searchParams.set('subscriberType', 'SPACE');
        if (cursor) url.searchParams.set('cursor', cursor);
        var res = await fetch(url.toString(), {
          credentials: 'include',
          headers: { 'X-Api-Level': '11', 'Accept': 'application/json, text/plain, */*' }
        });
        if (!res.ok) throw new Error(type + ' HTTP ' + res.status);
        var json = await res.json();
        if (safety === 1) console.log('[fans-bookmarklet] ' + type + ' 첫 페이지 응답:', json);
        var batch = [].concat(json.influencerItems || [], json.naverItems || [], json.items || []);
        for (var i = 0; i < batch.length; i++) items.push(batch[i]);
        var paging = json.paging || {};
        var next = paging.next || paging.cursor || paging.nextCursor || null;
        var hasMore = paging.hasMore;
        if (!next || hasMore === false || batch.length === 0) break;
        cursor = next;
      }
      return items;
    }

    function pick() {
      var args = Array.prototype.slice.call(arguments);
      for (var i = 0; i < args.length; i++) if (args[i] !== undefined && args[i] !== null && args[i] !== '') return args[i];
      return undefined;
    }

    function normalize(rawList) {
      var out = [];
      for (var i = 0; i < rawList.length; i++) {
        var raw = rawList[i] || {};
        var space = raw.space || raw;
        var profile = (space && space.profile) || raw.profile || {};
        var myKeyword = (space && space.myKeyword) || raw.myKeyword || {};
        var item = {
          urlId: pick(space.urlId, raw.urlId),
          spaceId: pick(space.id, raw.spaceId, raw.id) || null,
          ownerId: pick(space.ownerId, raw.ownerId) || null,
          nickname: pick(profile.nickName, raw.nickName, raw.nickname) || '',
          imageUrl: pick(profile.profileImageUrl, raw.profileImageUrl, raw.imageUrl) || '',
          category: pick(myKeyword.keyword, raw.keyword, raw.category) || '',
          followerCount: pick(profile.followerCount, raw.followerCount) || 0
        };
        if (item.urlId) out.push(item);
      }
      return out;
    }

    var rawFollowers = await fetchAll('/home/api/v2/spaces/' + spaceId + '/subscribes/followers', 'followers');
    var rawFollowings = await fetchAll('/home/api/v2/spaces/' + spaceId + '/subscribes/following', 'following');
    var followers = normalize(rawFollowers);
    var followings = normalize(rawFollowings);

    var payload = {
      source: 'bookmarklet',
      ownerUrlId: urlId,
      ownerSpaceId: spaceId,
      followers: followers,
      followings: followings
    };
    console.log('[fans-bookmarklet] 정규화 결과:', payload);
    var text = JSON.stringify(payload);

    try {
      await navigator.clipboard.writeText(text);
      alert('✅ 복사 완료!\\n\\n나를 팬한 사람: ' + followers.length + '명\\n내가 팬한 사람: ' + followings.length + '명\\n\\nninfle.kr/my/fans/sync 의 붙여넣기 영역에 붙여넣고 업로드하세요.');
    } catch (clipErr) {
      prompt('복사 실패. 아래 텍스트를 직접 복사(Cmd+C)해서 붙여넣으세요:', text);
    }
  } catch (e) {
    console.error('[fans-bookmarklet] 실패:', e);
    alert('실패: ' + (e && e.message ? e.message : String(e)) + '\\n\\nF12 콘솔에서 자세한 오류를 확인하세요.');
  }
})();
`.trim();

// javascript: URL로 사용할 수 있도록 한 줄로 압축
export const fanBookmarkletCode = 'javascript:' + SCRIPT.replace(/\s+/g, ' ').replace(/\s*\n\s*/g, ' ');
