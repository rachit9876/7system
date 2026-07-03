
const window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: (cb)=>{} };
const document = { 
    documentElement: { classList: { contains: ()=>false }, style: { getPropertyValue: ()=>'' } }, 
    getElementById: ()=>({ 
        getContext: ()=>({ font: '', strokeStyle: '', lineWidth: 0, fillStyle: '', save:()=>{}, restore:()=>{}, beginPath:()=>{}, moveTo:()=>{}, lineTo:()=>{}, stroke:()=>{}, fillRect:()=>{}, strokeRect:()=>{}, drawImage:()=>{}, fillText:()=>{}, measureText: ()=>({width: 10}) }), 
        addEventListener: ()=>{} 
    }) 
};
const localStorage = { getItem: ()=>null, setItem: ()=>{} };
const sessionStorage = { getItem: ()=>null, setItem: ()=>{} };
const navigator = { clipboard: { writeText: ()=>{} } };
const Image = function() { this.complete = true; this.naturalWidth = 100; this.naturalHeight = 100; };

        // Redirect small screens to the mobile notice page.
        if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
            window.location.replace('mobile.html');
        }
    
renderMarkdownText(document.getElementById('c').getContext('2d'), '| h1 | h2 |\n|---|---|\n| row1 | ![alt](url) |', 0, 0); console.log('success');