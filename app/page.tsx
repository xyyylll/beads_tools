import{requireChatGPTUser}from'./chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){await requireChatGPTUser('/');return <iframe title="豆屿 · 拼豆管理" src="/studio/index.html" style={{display:'block',border:0,width:'100%',height:'100dvh'}}/>}
