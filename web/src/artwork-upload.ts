export function readArtworkBase64(file:Blob,signal:AbortSignal) {
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    const abort=()=>{reader.abort();reject(new Error('cancelled'));};
    if(signal.aborted){reject(new Error('cancelled'));return;}
    signal.addEventListener('abort',abort,{once:true});
    reader.onloadend=()=>{
      signal.removeEventListener('abort',abort);
      if(reader.error || typeof reader.result!=='string')reject(new Error('image-read-failed'));
      else resolve(reader.result.slice(reader.result.indexOf(',')+1));
    };
    reader.readAsDataURL(file);
  });
}
