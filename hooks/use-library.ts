import { useParams } from 'next/navigation';

export function useLibrary() {
  const params = useParams();
  const libraryId = Array.isArray(params.libraryId) 
    ? params.libraryId[0] 
    : params.libraryId;

  if (!libraryId) {
    throw new Error('libraryId not found in route params');
  }

  return { libraryId };
}
