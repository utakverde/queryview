import glob, json, os
import pandas as pd

rows=[]
detail=[]
files=[filename for filename in glob.glob(os.path.join('sales feeder','*.xlsb')) if not os.path.basename(filename).startswith('~$')]
for filename in files:
    frame=pd.read_excel(filename,engine='pyxlsb')
    frame.columns=[str(column).strip().lower() for column in frame.columns]
    feeder='feedernumber' if 'feedernumber' in frame.columns else 'mcretailcustcharge'
    office=os.path.basename(filename).split(' 2026')[0].replace(' bi','').upper()
    source='Individual' if ' bi ' in os.path.basename(filename).lower() else 'Regular'
    source_columns=['area','book','accountnumber','name','demand','address','ratecode','serial','diff','multiplier','totalbill','kilowatthour',feeder,'sequence']
    source_frame=frame.reindex(columns=source_columns).copy()
    source_frame.columns=['area','book','accountNumber','name','demand','address','rateCode','serial','difference','multiplier','totalBill','kwh','feeder','sequence']
    source_frame['office']=office; source_frame['source']=source
    detail.append(source_frame)
    selected=frame[['area','book',feeder,'ratecode','kilowatthour','demand','totalbill']].copy()
    selected.columns=['area','book','feeder','rateCode','kwh','demand','totalBill']
    selected['office']=office; selected['source']=source
    rows.append(selected)
data=pd.concat(rows,ignore_index=True)
detail=pd.concat(detail,ignore_index=True)
for column in ['area','book','feeder','kwh','demand','totalBill']:
    data[column]=pd.to_numeric(data[column],errors='coerce')
data=data.dropna(subset=['area','book','feeder'])
data[['area','book','feeder']]=data[['area','book','feeder']].astype(int)
data[['kwh','demand','totalBill']]=data[['kwh','demand','totalBill']].fillna(0)
grouped=data.groupby(['office','source','area','book','feeder','rateCode'],dropna=False).agg(consumers=('rateCode','size'),kwh=('kwh','sum'),demand=('demand','sum'),totalBill=('totalBill','sum')).reset_index()
mapping=data.groupby(['office','area','book']).agg(feeders=('feeder',lambda values:sorted(set(int(value) for value in values))),records=('feeder','size')).reset_index()
payload={'period':'0726','generatedFrom':[os.path.basename(value) for value in files],'rows':grouped.to_dict('records'),'mapping':[{'office':r.office,'area':int(r.area),'book':int(r.book),'feeders':r.feeders,'records':int(r.records),'status':'Mixed' if len(r.feeders)>1 else 'Mapped'} for r in mapping.itertuples()]}
for column in ['area','book','feeder','demand','difference','multiplier','totalBill','kwh','sequence']:
    detail[column]=pd.to_numeric(detail[column],errors='coerce')
detail=detail.dropna(subset=['area','book','feeder']).fillna('')
detail[['area','book','feeder']]=detail[['area','book','feeder']].astype(int)
payload['detail']=detail[['office','source','area','book','accountNumber','name','address','rateCode','serial','difference','multiplier','kwh','demand','totalBill','feeder','sequence']].to_dict('records')
os.makedirs('generated',exist_ok=True)
with open(os.path.join('generated','feeder-engineering.json'),'w',encoding='utf-8') as output:json.dump(payload,output,separators=(',',':'))
print(f"Created {len(payload['detail'])} detail rows, {len(payload['rows'])} aggregate rows and {len(payload['mapping'])} area-book mappings")
