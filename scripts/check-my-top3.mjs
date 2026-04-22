import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const RAW = {
  1: `위저드베이커리, 파과, 구병모아가미, 경영책, 장사의신, 꽃을보듯너를본다, 모닝루틴, 낙화, 렛뎀이론, 경험의멸종, 감정어휘, 눈물을마시는새, 게임판타지소설추천, 삼국지사자성어, 황석영삼국지, 이문열삼국지, 설민석삼국지, 돌이킬수없는약속, 그리고아무도없었다, 용의자X의헌신, 독서록쓰는법, 바르셀로나의유서, 고도를기다리며책, 독후감쓰는법, 독후감양식, 어느날고궁을나오면서, 에세이쓰는법, 연애책, 경혜공주, 두근두근내인생, 원미동사람들, 여름은고작계절, 첫여름완주, 바깥은여름, 콩쥐팥쥐, 이상한나라의앨리스, 천자문, 인터넷소설, 당신이누군가를죽였다, 침묵의퍼레이드, 금강반야바라밀경, 금강경, 백수세끼, 하렘의남자들, 방과후전쟁활동, 화학으로이루어진세상, 화학관련도서, 엄마가화났다, 우리엄마는슈퍼우먼, 개인주의자선언, 법관련책, 목민심서, 정약용공부법, 진이지니, 7년의밤, 해가지는곳으로, 일기쓰는법, 엄마의말하기연습, 엄마심리수업, 엄마의말연습, 검은꽃, 마법천자문, 이번생도잘부탁해, 종말의발키리, 남주의첫날밤을가져버렸다, 문장부호, 유리알유희, 손끝과연연, 그저여명일뿐, 오빠그건오해야, 신경끄기의기술, 해변의카프카, 그해우리는웹툰, 옷소매붉은끝동, 행동하지않으면인생은바뀌지않는다, 마당을나온암탉, 사랑은없는것처럼, 함부로친절하지말라, 너에게들려주는단단한말, 약한영웅, 마스크걸, 공포의외인구단, 백설공주, 내남편과결혼해줘, 무협웹툰추천, 북검전기, 셰익스피어5대희극, 먼치킨소설, 오늘부터신령님, 아우라한국사, 마도전생기, 사랑후에오는것들, 이민진작가, 이두나, 수학이필요한순간, 아큐정전, 베이비폭군, 베르나르베르베르나무, 우리말어감사전, 난쟁이가쏘아올린작은공`,
  2: `편안함의습격, 로맨스웹소설, 로맨스판타지소설추천, 심리책, 궁에는개꽃이산다, 운명의과학, 사랑의기술, 홍학의자리, 북콘서트, 독후감쓰기, 독후감, 작가되는법, 나는소망한다내게금지된것을, 장미와나이프, 언제들어도좋은말, 웹툰책, 돈의속성, 세이노의가르침, 서평예시, 완전한행복, 종의기원, 속독법, 자존감책, 오직두사람, 시편23편, 성경책, 참회록, 카라마조프가의형제들, 편지잘쓰는법, 1984, 모비딕, 남주의첫날밤을가져버렸다소설, 신춘문예, 1q84, 노르웨이의숲, 이별글귀, 유아전집추천, 울어봐빌어도좋고, 위대한개츠비책, 화산귀환, 열혈강호, 글쓰는법, 햄릿명대사, 파친코책, 나혼자만레벨업소설, 나는고양이로소이다`,
  3: `북리뷰, 이형기낙화, 힐링책, 돈키호테, 판타지소설추천, 삼국지, 추리소설베스트셀러, 천개의파랑, 로맨스웹툰추천, 서평쓰기, 영원한천국, 작별인사, 김영하작별인사, 시편119편, 한강소년이온다, 별헤는밤, 호밀밭의파수꾼, 아몬드책, 강아지똥, 긍정의힘, 판타지웹툰, 회색인간, 에덴의동쪽, 페스트책, 수레바퀴아래서, 법륜스님책, 왜그들만부자가되는가, 청춘의필사, 스파이패밀리, 내일은실험왕, 왜나는너를사랑하는가, 거인의노트, 악의마음을읽는자들, 한강채식주의자, 채식주의자, 심보선, 아주세속적인지혜, 비행운, 나의라임오렌지나무, 노벨문학상수상자, 기분이태도가되지말자`,
};

function norm(k) { return k.replace(/\s+/g, '').toLowerCase(); }

async function fetchAll(cleanKeys) {
  const result = {};
  const chunk = 100;
  for (let i = 0; i < cleanKeys.length; i += chunk) {
    const slice = cleanKeys.slice(i, i + chunk);
    const { data, error } = await s
      .from('keyword_challenges')
      .select('keyword, keyword_clean, participant_count, search_volume_monthly')
      .in('keyword_clean', slice);
    if (error) { console.error(error); return result; }
    for (const row of data) result[row.keyword_clean] = row;
  }
  return result;
}

async function run() {
  const out = {};
  for (const rank of [1, 2, 3]) {
    const keywords = RAW[rank].split(',').map(k => k.trim()).filter(Boolean);
    const cleans = keywords.map(norm);
    const found = await fetchAll(cleans);
    out[rank] = keywords.map((k, i) => {
      const r = found[cleans[i]];
      return { keyword: k, pc: r?.participant_count ?? null, vol: r?.search_volume_monthly ?? null, found: !!r };
    });
  }

  for (const rank of [1, 2, 3]) {
    const rows = out[rank];
    const foundRows = rows.filter(r => r.found);
    const pcs = foundRows.map(r => r.pc).filter(v => v != null).sort((a, b) => a - b);
    const avg = pcs.reduce((a, b) => a + b, 0) / (pcs.length || 1);
    const median = pcs.length ? pcs[Math.floor(pcs.length / 2)] : 0;
    const lt50 = pcs.filter(v => v < 50).length;
    const lt100 = pcs.filter(v => v < 100).length;
    const lt200 = pcs.filter(v => v < 200).length;
    const ge500 = pcs.filter(v => v >= 500).length;
    console.log(`\n=== ${rank}등 (입력 ${rows.length}개 / DB매칭 ${foundRows.length}개) ===`);
    console.log(`참여자수 중앙값 ${median} / 평균 ${avg.toFixed(1)} / 최소 ${pcs[0] ?? '-'} / 최대 ${pcs[pcs.length-1] ?? '-'}`);
    console.log(`<50: ${lt50}개 / <100: ${lt100}개 / <200: ${lt200}개 / ≥500: ${ge500}개`);
    const lowest = [...foundRows].filter(r => r.pc != null).sort((a, b) => a.pc - b.pc).slice(0, 15);
    console.log('참여자수 하위 15:');
    lowest.forEach(r => console.log(`  ${r.keyword.padEnd(22)} 참여자 ${String(r.pc).padStart(4)} / 검색량 ${r.vol ?? '-'}`));
    const notFound = rows.filter(r => !r.found);
    if (notFound.length) console.log(`DB 미매칭 (${notFound.length}):`, notFound.map(r => r.keyword).join(', '));
  }
}

run().catch(console.error);
