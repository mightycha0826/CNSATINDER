import { error } from '@sveltejs/kit';
import { LEGAL_IDS, type LegalId } from '$lib/legal';

export const load = ({ params }: { params: { doc: string } }) => {
	if (!LEGAL_IDS.includes(params.doc as LegalId)) error(404, '없는 문서예요');
};
