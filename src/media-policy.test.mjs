import test from 'node:test';
import assert from 'node:assert/strict';
import media from '../public/cotego-media.js';
const now=new Date('2026-11-15T12:00:00Z');
test('football and basketball photos expire after one calendar year',()=>{
 for(const sport of ['football','basketball','basket']){
  assert.equal(media.isPhotoAllowed({capturedAt:'2025-11-15'},sport,now),true);
  assert.equal(media.isPhotoAllowed({capturedAt:'2025-11-14'},sport,now),false);
  assert.equal(media.isPhotoAllowed({capturedAt:'2026-11-15'},sport,now),true);
  assert.equal(media.isPhotoAllowed({capturedAt:'2026-11-16'},sport,now),false);
 }
});
test('the age of tennis photos is unrestricted',()=>{
 assert.equal(media.isPhotoAllowed({capturedAt:'2018-06-10'},'tennis',now),true);
});
test('unknown, impossible, and future capture dates are not accepted as recent photos',()=>{
 for(const capturedAt of [undefined,'','2026-02-30','2026-2-01','2026-11-16'])
  assert.equal(media.isPhotoAllowed({capturedAt},'football',now),false);
 assert.equal(media.isPhotoAllowed({capturedAt:'2026-10-01'},'football',new Date('invalid')),false);
});
test('one-year age limit handles leap day without extending the cutoff',()=>{
 const leap=new Date('2028-02-29T12:00:00Z');
 assert.equal(media.isPhotoAllowed({capturedAt:'2027-02-28'},'football',leap),true);
 assert.equal(media.isPhotoAllowed({capturedAt:'2027-02-27'},'football',leap),false);
});
test('old photos cannot be selected just because the club matches; a photo expires on the next day',()=>{
 const match={sourceId:5,teamIds:[524,523]};
 const photo={sport:'football',teamId:524,capturedAt:'2025-11-15',src:'/media/psg.jpg'};
 assert.equal(media.fixturePhoto(match,'football',now,[photo]),photo);
 assert.equal(media.fixturePhoto(match,'football',new Date('2026-11-16'),[photo]),null);
 assert.equal(media.fixturePhoto({...match,teamIds:[64,65]},'football',now,[photo]),null);
 assert.equal(media.fixturePhoto({...match,sourceId:null},'football',now,[photo]),null);
 assert.equal(media.fixturePhoto(match,'football',now,[{...photo,src:'https://external.example/psg.jpg'}]),null);
});
test('no old catalog photo is shown when no eligible illustration exists',()=>{
 assert.equal(media.fixturePhoto({sourceId:5,teamIds:[524,523]},'football',now),null);
});
test('crest URLs are restricted to trusted provider images, with local copies preferred',()=>{
 assert.equal(media.crestUrl(524,null),'/media/clubs/524.png');
 assert.equal(media.crestUrl(65,'https://crests.football-data.org/65.svg'),'https://crests.football-data.org/65.svg');
 assert.equal(media.crestUrl(null,'https://crests.football-data.org/65.svg'),null);
 for(const value of ['https://evil.example/65.svg','javascript:alert(1)','https://crests.football-data.org.evil.example/65.png','https://crests.football-data.org/65.png?key=abc','https://a:b@crests.football-data.org/65.png','https://crests.football-data.org/../wrong'])
  assert.equal(media.crestUrl(65,value),null);
});
