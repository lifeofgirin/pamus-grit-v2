"use client";

import { useEffect } from "react";

export default function PwaRegister(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;

    const register=()=>{
      navigator.serviceWorker
        .register("/sw.js",{scope:"/"})
        .catch((error)=>{
          console.error("PWA service worker registration failed:",error);
        });
    };

    if(document.readyState==="complete"){
      register();
      return;
    }

    window.addEventListener("load",register,{once:true});

    return ()=>{
      window.removeEventListener("load",register);
    };
  },[]);

  return null;
}
