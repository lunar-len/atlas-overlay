// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x$1 = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x$1 = ((x$1 & 0xCCCC) >> 2) | ((x$1 & 0x3333) << 2);
    x$1 = ((x$1 & 0xF0F0) >> 4) | ((x$1 & 0x0F0F) << 4);
    rev[i] = (((x$1 & 0xFF00) >> 8) | ((x$1 & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    , // determined by compression function
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length, dl = 0;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (resize)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17
        if (resize)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (resize)
                    cbuf(bt + 131072);
                var end = bt + add;
                if (bt < dt) {
                    var shift = dl - dt, dend = Math.min(dt, end);
                    if (shift + bt < 0)
                        err(3);
                    for (; bt < dend; ++bt)
                        buf[bt] = dict[shift + bt];
                }
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
// empty
var et = /*#__PURE__*/ new u8(0);
// gzip footer: -8 to -4 = CRC, -4 to -0 is length
// gzip start
var gzs = function (d) {
    if (d[0] != 31 || d[1] != 139 || d[2] != 8)
        err(6, 'invalid gzip data');
    var flg = d[3];
    var st = 10;
    if (flg & 4)
        st += (d[10] | d[11] << 8) + 2;
    for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
        ;
    return st + (flg & 2);
};
// gzip length
var gzl = function (d) {
    var l = d.length;
    return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
// zlib start
var zls = function (d, dict) {
    if ((d[0] & 15) != 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
        err(6, 'invalid zlib data');
    if ((d[1] >> 5 & 1) == 1)
        err(6, 'invalid zlib data: ' + (d[1] & 32 ? 'need' : 'unexpected') + ' dictionary');
    return (d[1] >> 3 & 4) + 2;
};
function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts, opts);
}
function gunzipSync(data, opts) {
    var st = gzs(data);
    if (st + 8 > data.length)
        err(6, 'invalid gzip data');
    return inflt(data.subarray(st, -8), { i: 2 }, new u8(gzl(data)), opts);
}
function unzlibSync(data, opts) {
    return inflt(data.subarray(zls(data), -4), { i: 2 }, opts, opts);
}
/**
 * Expands compressed GZIP, Zlib, or raw DEFLATE data, automatically detecting the format
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function decompressSync(data, opts) {
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzipSync(data, opts)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflateSync(data, opts)
            : unzlibSync(data, opts);
}
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }

var z=Object.defineProperty;var B=Math.pow;var d=(i,t)=>z(i,"name",{value:t,configurable:true});var m=(i,t,e)=>new Promise((r,n)=>{var s=c=>{try{a(e.next(c));}catch(u){n(u);}},o=c=>{try{a(e.throw(c));}catch(u){n(u);}},a=c=>c.done?r(c.value):Promise.resolve(c.value).then(s,o);a((e=e.apply(i,t)).next());});var re=d((i,t)=>{let e=false,r="",n=L.GridLayer.extend({createTile:d((s,o)=>{let a=document.createElement("img"),c=new AbortController,u=c.signal;return a.cancel=()=>{c.abort();},e||(i.getHeader().then(l=>{l.tileType===1||l.tileType===6?console.error("Error: archive contains vector tiles, but leafletRasterLayer is for displaying raster tiles. See https://github.com/protomaps/PMTiles/tree/main/js for details."):l.tileType===2?r="image/png":l.tileType===3?r="image/jpeg":l.tileType===4?r="image/webp":l.tileType===5&&(r="image/avif");}),e=true),i.getZxy(s.z,s.x,s.y,u).then(l=>{if(l){let f=new Blob([l.data],{type:r}),y=window.URL.createObjectURL(f);a.src=y;}else a.style.display="none";a.cancel=void 0,o(void 0,a);}).catch(l=>{if(l.name!=="AbortError")throw l}),a},"createTile"),_removeTile:d(function(s){let o=this._tiles[s];o&&(o.el.cancel&&o.el.cancel(),o.el.src&&window.URL.revokeObjectURL(o.el.src),o.el.width=0,o.el.height=0,o.el.deleted=true,L.DomUtil.remove(o.el),delete this._tiles[s],this.fire("tileunload",{tile:o.el,coords:this._keyToTileCoords(s)}));},"_removeTile")});return new n(t)},"leafletRasterLayer"),W=d(i=>(t,e)=>{if(e instanceof AbortController)return i(t,e);let r=new AbortController;return i(t,r).then(n=>e(void 0,n.data,n.cacheControl||"",n.expires||""),n=>e(n)).catch(n=>e(n)),{cancel:d(()=>r.abort(),"cancel")}},"v3compat"),E=class E{constructor(t){this.tilev4=d((t,e)=>m(this,null,function*(){if(t.type==="json"){let y=t.url.substr(10),p=this.tiles.get(y);if(p||(p=new w(y),this.tiles.set(y,p)),this.metadata){let j=yield p.getTileJson(t.url);return e.signal.throwIfAborted(),{data:j}}let h=yield p.getHeader();return e.signal.throwIfAborted(),(h.minLon>=h.maxLon||h.minLat>=h.maxLat)&&console.error(`Bounds of PMTiles archive ${h.minLon},${h.minLat},${h.maxLon},${h.maxLat} are not valid.`),{data:{tiles:[`${t.url}/{z}/{x}/{y}`],minzoom:h.minZoom,maxzoom:h.maxZoom,bounds:[h.minLon,h.minLat,h.maxLon,h.maxLat]}}}let r=new RegExp(/pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/),n=t.url.match(r);if(!n)throw new Error("Invalid PMTiles protocol URL");let s=n[1],o=this.tiles.get(s);o||(o=new w(s),this.tiles.set(s,o));let a=n[2],c=n[3],u=n[4],l=yield o==null?void 0:o.getZxy(+a,+c,+u,e.signal);if(e.signal.throwIfAborted(),l)return {data:new Uint8Array(l.data),cacheControl:l.cacheControl,expires:l.expires};let f=yield o.getHeader();if(f.tileType===1||f.tileType===6){if(this.errorOnMissingTile)throw new Error("Tile not found.");return {data:new Uint8Array}}return {data:null}}),"tilev4");this.tile=W(this.tilev4);this.tiles=new Map,this.metadata=(t==null?void 0:t.metadata)||false,this.errorOnMissingTile=(t==null?void 0:t.errorOnMissingTile)||false;}add(t){this.tiles.set(t.source.getKey(),t);}get(t){return this.tiles.get(t)}};d(E,"Protocol");var S=E;function b(i,t){return (t>>>0)*4294967296+(i>>>0)}d(b,"toNum");function N(i,t){let e=t.buf,r=e[t.pos++],n=(r&112)>>4;if(r<128||(r=e[t.pos++],n|=(r&127)<<3,r<128)||(r=e[t.pos++],n|=(r&127)<<10,r<128)||(r=e[t.pos++],n|=(r&127)<<17,r<128)||(r=e[t.pos++],n|=(r&127)<<24,r<128)||(r=e[t.pos++],n|=(r&1)<<31,r<128))return b(i,n);throw new Error("Expected varint not more than 10 bytes")}d(N,"readVarintRemainder");function x(i){let t=i.buf,e=t[i.pos++],r=e&127;return e<128||(e=t[i.pos++],r|=(e&127)<<7,e<128)||(e=t[i.pos++],r|=(e&127)<<14,e<128)||(e=t[i.pos++],r|=(e&127)<<21,e<128)?r:(e=t[i.pos],r|=(e&15)<<28,N(r,i))}d(x,"readVarint");function Z(i,t,e,r,n){return n===0?r!==0?[i-1-e,i-1-t]:[e,t]:[t,e]}d(Z,"rotate");function q(i,t,e){if(i>26)throw new Error("Tile zoom level exceeds max safe number limit (26)");if(t>=1<<i||e>=1<<i)throw new Error("tile x/y outside zoom level bounds");let r=((1<<i)*(1<<i)-1)/3,n=i-1,[s,o]=[t,e];for(let a=1<<n;a>0;a>>=1){let c=s&a,u=o&a;r+=(3*c^u)*(1<<n),[s,o]=Z(a,s,o,c,u),n--;}return r}d(q,"zxyToTileId");function G(i){let t=3*i+1;return t<4294967296?31-Math.clz32(t):63-Math.clz32(t/4294967296)}d(G,"tileIdToZ");function oe(i){let t=G(i)>>1;if(t>26)throw new Error("Tile zoom level exceeds max safe number limit (26)");let e=((1<<t)*(1<<t)-1)/3,r=i-e,n=0,s=0,o=1<<t;for(let a=1;a<o;a<<=1){let c=a&r/2,u=a&(r^c);[n,s]=Z(a,n,s,c,u),r=r/2,n+=c,s+=u;}return [t,n,s]}d(oe,"tileIdToZxy");var J=(s=>(s[s.Unknown=0]="Unknown",s[s.None=1]="None",s[s.Gzip=2]="Gzip",s[s.Brotli=3]="Brotli",s[s.Zstd=4]="Zstd",s))(J||{});function D(i,t){return m(this,null,function*(){if(t===1||t===0)return i;if(t===2){if(typeof globalThis.DecompressionStream=="undefined")return decompressSync(new Uint8Array(i));let e=new Response(i).body;if(!e)throw new Error("Failed to read response stream");let r=e.pipeThrough(new globalThis.DecompressionStream("gzip"));return new Response(r).arrayBuffer()}throw new Error("Compression method not supported")})}d(D,"defaultDecompress");var O=(a=>(a[a.Unknown=0]="Unknown",a[a.Mvt=1]="Mvt",a[a.Png=2]="Png",a[a.Jpeg=3]="Jpeg",a[a.Webp=4]="Webp",a[a.Avif=5]="Avif",a[a.Mlt=6]="Mlt",a))(O||{});function _(i){return i===1?".mvt":i===2?".png":i===3?".jpg":i===4?".webp":i===5?".avif":i===6?".mlt":""}d(_,"tileTypeExt");var Y=127;function Q(i,t){let e=0,r=i.length-1;for(;e<=r;){let n=r+e>>1,s=t-i[n].tileId;if(s>0)e=n+1;else if(s<0)r=n-1;else return i[n]}return r>=0&&(i[r].runLength===0||t-i[r].tileId<i[r].runLength)?i[r]:null}d(Q,"findTile");var A=class A{constructor(t){this.file=t;}getKey(){return this.file.name}getBytes(t,e){return m(this,null,function*(){return {data:yield this.file.slice(t,t+e).arrayBuffer()}})}};d(A,"FileSource");var $=A,P=class P{constructor(t,e=new Headers,r=void 0){var a,c;this.url=t,this.customHeaders=e,this.credentials=r,this.mustReload=false;let n="";"navigator"in globalThis&&(n=(c=(a=globalThis.navigator)==null?void 0:a.userAgent)!=null?c:"");let s=n.indexOf("Windows")>-1,o=/Chrome|Chromium|Edg|OPR|Brave/.test(n);this.chromeWindowsNoCache=false,s&&o&&(this.chromeWindowsNoCache=true);}getKey(){return this.url}setHeaders(t){this.customHeaders=t;}getBytes(t,e,r,n){return m(this,null,function*(){let s,o;r?o=r:(s=new AbortController,o=s.signal);let a=new Headers(this.customHeaders);a.set("range",`bytes=${t}-${t+e-1}`);let c;this.mustReload?c="reload":this.chromeWindowsNoCache&&(c="no-store");let u=yield fetch(this.url,{signal:o,cache:c,headers:a,credentials:this.credentials});if(t===0&&u.status===416){let p=u.headers.get("Content-Range");if(!p||!p.startsWith("bytes */"))throw new Error("Missing content-length on 416 response");let h=+p.substr(8);a.set("range",`bytes=0-${h-1}`),u=yield fetch(this.url,{signal:o,cache:"reload",headers:a,credentials:this.credentials});}let l=u.headers.get("Etag");if(l!=null&&l.startsWith("W/")&&(l=null),u.status===416||n&&l&&l!==n)throw this.mustReload=true,new v(`Server returned non-matching ETag ${n} after one retry. Check browser extensions and servers for issues that may affect correct ETag headers.`);if(u.status>=300)throw new Error(`Bad response code: ${u.status}`);let f=u.headers.get("Content-Length");if(u.status===200&&(!f||+f>e))throw s&&s.abort(),new Error("Server returned no content-length header or content-length exceeding request. Check that your storage backend supports HTTP Byte Serving.");return {data:yield u.arrayBuffer(),etag:l||void 0,cacheControl:u.headers.get("Cache-Control")||void 0,expires:u.headers.get("Expires")||void 0}})}};d(P,"FetchSource");var T=P;function g(i,t){let e=i.getUint32(t+4,true),r=i.getUint32(t+0,true);return e*B(2,32)+r}d(g,"getUint64");function X(i,t){let e=new DataView(i),r=e.getUint8(7);if(r>3)throw new Error(`Archive is spec version ${r} but this library supports up to spec version 3`);return {specVersion:r,rootDirectoryOffset:g(e,8),rootDirectoryLength:g(e,16),jsonMetadataOffset:g(e,24),jsonMetadataLength:g(e,32),leafDirectoryOffset:g(e,40),leafDirectoryLength:g(e,48),tileDataOffset:g(e,56),tileDataLength:g(e,64),numAddressedTiles:g(e,72),numTileEntries:g(e,80),numTileContents:g(e,88),clustered:e.getUint8(96)===1,internalCompression:e.getUint8(97),tileCompression:e.getUint8(98),tileType:e.getUint8(99),minZoom:e.getUint8(100),maxZoom:e.getUint8(101),minLon:e.getInt32(102,true)/1e7,minLat:e.getInt32(106,true)/1e7,maxLon:e.getInt32(110,true)/1e7,maxLat:e.getInt32(114,true)/1e7,centerZoom:e.getUint8(118),centerLon:e.getInt32(119,true)/1e7,centerLat:e.getInt32(123,true)/1e7,etag:t}}d(X,"bytesToHeader");function I(i){let t={buf:new Uint8Array(i),pos:0},e=x(t),r=[],n=0;for(let s=0;s<e;s++){let o=x(t);r.push({tileId:n+o,offset:0,length:0,runLength:1}),n+=o;}for(let s=0;s<e;s++)r[s].runLength=x(t);for(let s=0;s<e;s++)r[s].length=x(t);for(let s=0;s<e;s++){let o=x(t);o===0&&s>0?r[s].offset=r[s-1].offset+r[s-1].length:r[s].offset=o-1;}return r}d(I,"deserializeIndex");var R=class R extends Error{};d(R,"EtagMismatch");var v=R;function V(i,t){return m(this,null,function*(){let e=yield i.getBytes(0,16384);if(new DataView(e.data).getUint16(0,true)!==19792)throw new Error("Wrong magic number for PMTiles archive");let n=e.data.slice(0,Y),s=X(n,e.etag),o=e.data.slice(s.rootDirectoryOffset,s.rootDirectoryOffset+s.rootDirectoryLength),a=`${i.getKey()}|${s.etag||""}|${s.rootDirectoryOffset}|${s.rootDirectoryLength}`,c=I(yield t(o,s.internalCompression));return [s,[a,c.length,c]]})}d(V,"getHeaderAndRoot");function K(i,t,e,r,n){return m(this,null,function*(){let s=yield i.getBytes(e,r,void 0,n.etag),o=yield t(s.data,n.internalCompression),a=I(o);if(a.length===0)throw new Error("Empty directory is invalid");return a})}d(K,"getDirectory");var U=class U{constructor(t=100,e=true,r=D){this.cache=new Map,this.maxCacheEntries=t,this.counter=1,this.decompress=r;}getHeader(t){return m(this,null,function*(){let e=t.getKey(),r=this.cache.get(e);if(r)return r.lastUsed=this.counter++,r.data;let n=yield V(t,this.decompress);return n[1]&&this.cache.set(n[1][0],{lastUsed:this.counter++,data:n[1][2]}),this.cache.set(e,{lastUsed:this.counter++,data:n[0]}),this.prune(),n[0]})}getDirectory(t,e,r,n){return m(this,null,function*(){let s=`${t.getKey()}|${n.etag||""}|${e}|${r}`,o=this.cache.get(s);if(o)return o.lastUsed=this.counter++,o.data;let a=yield K(t,this.decompress,e,r,n);return this.cache.set(s,{lastUsed:this.counter++,data:a}),this.prune(),a})}prune(){if(this.cache.size>this.maxCacheEntries){let t=1/0,e;this.cache.forEach((r,n)=>{r.lastUsed<t&&(t=r.lastUsed,e=n);}),e&&this.cache.delete(e);}}invalidate(t){return m(this,null,function*(){this.cache.delete(t.getKey());})}};d(U,"ResolvedValueCache");var k=U,M=class M{constructor(t=100,e=true,r=D){this.cache=new Map,this.invalidations=new Map,this.maxCacheEntries=t,this.counter=1,this.decompress=r;}getHeader(t){return m(this,null,function*(){let e=t.getKey(),r=this.cache.get(e);if(r)return r.lastUsed=this.counter++,yield r.data;let n=new Promise((s,o)=>{V(t,this.decompress).then(a=>{a[1]&&this.cache.set(a[1][0],{lastUsed:this.counter++,data:Promise.resolve(a[1][2])}),s(a[0]),this.prune();}).catch(a=>{o(a);});});return this.cache.set(e,{lastUsed:this.counter++,data:n}),n})}getDirectory(t,e,r,n){return m(this,null,function*(){let s=`${t.getKey()}|${n.etag||""}|${e}|${r}`,o=this.cache.get(s);if(o)return o.lastUsed=this.counter++,yield o.data;let a=new Promise((c,u)=>{K(t,this.decompress,e,r,n).then(l=>{c(l),this.prune();}).catch(l=>{u(l);});});return this.cache.set(s,{lastUsed:this.counter++,data:a}),a})}prune(){if(this.cache.size>=this.maxCacheEntries){let t=1/0,e;this.cache.forEach((r,n)=>{r.lastUsed<t&&(t=r.lastUsed,e=n);}),e&&this.cache.delete(e);}}invalidate(t){return m(this,null,function*(){let e=t.getKey();if(this.invalidations.get(e))return yield this.invalidations.get(e);this.cache.delete(t.getKey());let r=new Promise((n,s)=>{this.getHeader(t).then(o=>{n(),this.invalidations.delete(e);}).catch(o=>{s(o);});});this.invalidations.set(e,r);})}};d(M,"SharedPromiseCache");var C=M,H=class H{constructor(t,e,r){typeof t=="string"?this.source=new T(t):this.source=t,r?this.decompress=r:this.decompress=D,e?this.cache=e:this.cache=new C;}getHeader(){return m(this,null,function*(){return yield this.cache.getHeader(this.source)})}getZxyAttempt(t,e,r,n){return m(this,null,function*(){let s=q(t,e,r),o=yield this.cache.getHeader(this.source);if(t<o.minZoom||t>o.maxZoom)return;let a=o.rootDirectoryOffset,c=o.rootDirectoryLength;for(let u=0;u<=3;u++){let l=yield this.cache.getDirectory(this.source,a,c,o),f=Q(l,s);if(f){if(f.runLength>0){let y=yield this.source.getBytes(o.tileDataOffset+f.offset,f.length,n,o.etag);return {data:yield this.decompress(y.data,o.tileCompression),cacheControl:y.cacheControl,expires:y.expires}}a=o.leafDirectoryOffset+f.offset,c=f.length;}else return}throw new Error("Maximum directory depth exceeded")})}getZxy(t,e,r,n){return m(this,null,function*(){try{return yield this.getZxyAttempt(t,e,r,n)}catch(s){if(s instanceof v)return this.cache.invalidate(this.source),yield this.getZxyAttempt(t,e,r,n);throw s}})}getMetadataAttempt(){return m(this,null,function*(){let t=yield this.cache.getHeader(this.source),e=yield this.source.getBytes(t.jsonMetadataOffset,t.jsonMetadataLength,void 0,t.etag),r=yield this.decompress(e.data,t.internalCompression),n=new TextDecoder("utf-8");return JSON.parse(n.decode(r))})}getMetadata(){return m(this,null,function*(){try{return yield this.getMetadataAttempt()}catch(t){if(t instanceof v)return this.cache.invalidate(this.source),yield this.getMetadataAttempt();throw t}})}getTileJson(t){return m(this,null,function*(){let e=yield this.getHeader(),r=yield this.getMetadata(),n=_(e.tileType);return {tilejson:"3.0.0",scheme:"xyz",tiles:[`${t}/{z}/{x}/{y}${n}`],vector_layers:r.vector_layers,attribution:r.attribution,description:r.description,name:r.name,version:r.version,bounds:[e.minLon,e.minLat,e.maxLon,e.maxLat],center:[e.centerLon,e.centerLat,e.centerZoom],minzoom:e.minZoom,maxzoom:e.maxZoom}})}};d(H,"PMTiles");var w=H;

export { J as Compression, v as EtagMismatch, T as FetchSource, $ as FileSource, w as PMTiles, S as Protocol, k as ResolvedValueCache, C as SharedPromiseCache, O as TileType, X as bytesToHeader, Q as findTile, g as getUint64, re as leafletRasterLayer, x as readVarint, oe as tileIdToZxy, _ as tileTypeExt, q as zxyToTileId };
