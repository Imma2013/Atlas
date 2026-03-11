import { redirect } from 'next/navigation';

const AppsPage = () => {
  redirect('/settings?tab=connections');
};

export default AppsPage;

