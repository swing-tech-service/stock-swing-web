'use client';
import { useEffect,useState } from 'react';
import PocAnalysis from '../PocAnalysis';

export default function AdminAnalysis({userId,adminKey}:{userId:string;adminKey:string}) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    setVisible(false);
    if(userId==='takashimasaakiadmin' && adminKey) {
      fetch('/api/poc-analysis',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'availability',target:userId,user:userId,adminKey}),signal:controller.signal,cache:'no-store'})
        .then(async r=>{const b=await r.json();if(!controller.signal.aborted)setVisible(r.ok&&b.available===true);})
        .catch(()=>{});
    }
    return ()=>controller.abort();
  },[userId,adminKey]);
  return visible?<PocAnalysis target={userId} initialUser={userId} adminKey={adminKey}/>:null;
}
