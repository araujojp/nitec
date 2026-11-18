import re,base64,json,sys
def dec(path):
    s=open(path,encoding='utf-8').read()
    m=re.search(r"K=\[([0-9,]+)\],P='([A-Za-z0-9+/=]+)'",s)
    k=[int(x) for x in m.group(1).split(',')]; b=base64.b64decode(m.group(2))
    return s,m,k,json.loads(bytes(x^k[i%len(k)]^((i*131+17)&255) for i,x in enumerate(b)).decode())
if __name__=='__main__':
    for p in sys.argv[1:]:
        s,m,k,d=dec(p); json.dump(d,open(p+'.json','w'),ensure_ascii=False)
        j=d['j']; print(p,len(j),[ (t,j.count(t)) for t in ['Liberar suíte','Release suite','Liberar','drawer']])
