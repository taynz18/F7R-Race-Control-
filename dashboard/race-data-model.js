import {driverName} from './model.js?v=0.10.1';

export function driverRecords(races) {
  const records = new Map();
  for (const race of races) {
    const drivers = race.final_data?.drivers ?? [];
    const identities = drivers.map(driver => driverName(driver).trim().toLowerCase());
    drivers.forEach((driver, index) => {
      const key = identities[index];
      if (!key || key === 'player' || identities.indexOf(key) !== identities.lastIndexOf(key)) return;
      const record = records.get(key) ?? {
        name: driverName(driver), appearances: 0, finishes: 0, wins: 0,
        podiums: 0, dnf: 0, positionSum: 0,
      };
      record.appearances++;
      if (driver.result_status === 3 && Number.isInteger(driver.position) && driver.position > 0) {
        record.finishes++;
        record.positionSum += driver.position;
        if (driver.position === 1) record.wins++;
        if (driver.position <= 3) record.podiums++;
      }
      if (driver.result_status === 4 || driver.result_status === 7) record.dnf++;
      records.set(key, record);
    });
  }
  return [...records.values()].sort((a, b) =>
    b.wins - a.wins || b.podiums - a.podiums || b.finishes - a.finishes || a.name.localeCompare(b.name)
  );
}

export function compareLaps(a, b) {
  const aLaps = new Map(a.laps.map(lap => [lap.lap, lap.time]));
  const bLaps = new Map(b.laps.map(lap => [lap.lap, lap.time]));
  const laps = new Set([...aLaps.keys(), ...bLaps.keys()]);
  return [...laps].sort((x, y) => x - y).map(lap => {
    const first = aLaps.get(lap) ?? null;
    const second = bLaps.get(lap) ?? null;
    return {lap, first, second, delta: first !== null && second !== null ? first - second : null};
  });
}
