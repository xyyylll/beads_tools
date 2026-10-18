import type { ReactNode } from 'react';
export const metadata = { title: '豆屿 · 拼豆管理', description: '拼豆库存、图纸收藏与视觉模型识别' };
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="zh-CN"><body style={{margin:0}}>{children}</body></html>}
