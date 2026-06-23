export const RESERVATION_STATUSES = ['reserved', 'checked_in', 'cancelled', 'no_show', 'waitlist'];
export const CHECK_IN_METHODS = ['qr_scan', 'admin_manual'];

export function reservationMemberId(reservation) {
  return String(reservation?.member?._id || reservation?.member || '');
}

export function normalizeReservationStatus(reservation) {
  return RESERVATION_STATUSES.includes(reservation?.status) ? reservation.status : 'reserved';
}

export function isCapacityStatus(status) {
  return status === 'reserved' || status === 'checked_in';
}

export function isMineActive(reservation) {
  return isCapacityStatus(normalizeReservationStatus(reservation));
}

export function findReservationByMember(reservations = [], memberId) {
  const id = String(memberId);
  return reservations.find((reservation) => reservationMemberId(reservation) === id) || null;
}

export function countReservations(reservations = [], capacity = 0) {
  const counts = {
    reserved: 0,
    checkedIn: 0,
    cancelled: 0,
    waitlist: 0,
    noShow: 0
  };

  for (const reservation of reservations || []) {
    const status = normalizeReservationStatus(reservation);
    if (status === 'reserved') counts.reserved += 1;
    else if (status === 'checked_in') counts.checkedIn += 1;
    else if (status === 'cancelled') counts.cancelled += 1;
    else if (status === 'waitlist') counts.waitlist += 1;
    else if (status === 'no_show') counts.noShow += 1;
  }

  const spotsLeft = Math.max(0, Number(capacity || 0) - counts.reserved - counts.checkedIn);
  return { ...counts, capacity: Number(capacity || 0), spotsLeft };
}

export function ensureReservationDates(reservation, fallback = new Date()) {
  if (!reservation.reservedAt) reservation.reservedAt = reservation.at || fallback;
}

export function serializeRosterMember(reservation) {
  const member = reservation.member || {};
  return {
    member: member._id || member,
    name: member.name || '',
    email: member.email || null,
    status: normalizeReservationStatus(reservation),
    reservedAt: reservation.reservedAt || reservation.at || null,
    checkedInAt: reservation.checkedInAt || null,
    cancelledAt: reservation.cancelledAt || null,
    checkInMethod: reservation.checkInMethod || null
  };
}
