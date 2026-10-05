import { Suspense } from 'react';
import { headers } from 'next/headers';
import { cacheLife } from 'next/cache';

async function Cached({ slug }) {
  'use cache';
  cacheLife('max');
  return <p>Cached {slug}</p>;
}

async function Dynamic() {
  await headers();
  return <p>Runtime content</p>;
}

async function Content({ params }) {
  const { slug } = await params;
  return (
    <>
      <Cached slug={slug} />
      <Dynamic />
    </>
  );
}

// No generateStaticParams: `params` is runtime data, rendered under Suspense.
export default function Page({ params }) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content params={params} />
    </Suspense>
  );
}
