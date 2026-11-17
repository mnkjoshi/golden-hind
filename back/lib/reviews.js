// Review moderation helpers (pure, unit tested).

// Multi-path RTDB update that moves one user's reviews from
// reviews/<contentId>/<user> to reviewsArchive/<user>/<contentId>, so they stop
// showing anywhere but can still be restored by hand. reviewsTree is the whole
// reviews/ node.
export function buildReviewArchiveUpdate(reviewsTree, username, now) {
    const update = {};
    let count = 0;
    for (const [contentId, byUser] of Object.entries(reviewsTree || {})) {
        const review = byUser?.[username];
        if (!review) continue;
        update[`reviews/${contentId}/${username}`] = null;
        update[`reviewsArchive/${username}/${contentId}`] = { ...review, archivedAt: now };
        count++;
    }
    return { update, count };
}
