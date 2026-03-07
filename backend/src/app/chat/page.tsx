import ChatWindow from '@/components/ChatWindow';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat - Atlas',
  description: 'Chat with Atlas AI.',
};

const ChatPage = () => {
  return <ChatWindow />;
};

export default ChatPage;
