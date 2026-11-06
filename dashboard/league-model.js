export const POINTS = Object.freeze({
  classic: Object.freeze([25,18,15,12,10,8,6,4,2,1]),
  f7r: Object.freeze([30,25,22,20,18,15,13,11,10,8,6,5,4,2,1]),
});

export function pointsFor(position, scale) {
  if (scale === 'unset') return null;
  if (!Object.hasOwn(POINTS, scale)) throw Error('Choose a points scale.');
  return Number.isInteger(position) && position > 0 ? POINTS[scale][position - 1] ?? 0 : null;
}

export function validateArchive(archive) {
  if (archive?.format !== 'f7r-season-1' || typeof archive.name !== 'string' || !archive.name.trim() ||
      (archive.id != null && (typeof archive.id !== 'string' || !archive.id.trim())) ||
      !Array.isArray(archive.events) || (archive.scale !== 'unset' && !Object.hasOwn(POINTS, archive.scale))) {
    throw Error('Choose a valid F7R season file.');
  }
  for (const event of archive.events) {
    if (!event || typeof event.name !== 'string' || typeof event.date !== 'string' ||
        !Array.isArray(event.sessions)) throw Error('Invalid event.');
    for (const session of event.sessions) {
      if (!session || !Array.isArray(session.results)) throw Error('Invalid session.');
      for (const result of session.results) {
        if (!result || typeof result.driver !== 'string' ||
            (result.classification != null && !Number.isInteger(result.classification))) {
          throw Error('Invalid result.');
        }
      }
    }
  }
  return archive;
}
