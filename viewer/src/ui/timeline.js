function formatTime(seconds)
{
    return `${seconds.toFixed(2)}s`;
}

/**
 * Play/pause button, seek slider, and time label for the active animation
 * clip. Hidden while no clip is playing. Seconds, not frame numbers — the
 * GR2 JSON graph exposes clip `duration` in seconds and does not carry a
 * fixed frame rate.
 */
export function createTimeline(container, { onSeek, onPlayPause } = {})
{
    const wrapper = document.createElement("div");
    wrapper.className = "timeline";
    wrapper.hidden = true;

    const row = document.createElement("div");
    row.className = "timeline-row";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "timeline-play";
    playButton.textContent = "Pause";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "timeline-slider";
    slider.min = "0";
    slider.max = "1000";
    slider.value = "0";

    const timeLabel = document.createElement("span");
    timeLabel.className = "timeline-time";

    row.appendChild(playButton);
    row.appendChild(slider);
    wrapper.appendChild(row);
    wrapper.appendChild(timeLabel);
    container.appendChild(wrapper);

    let duration = 0;
    let scrubbing = false;
    let playing = true;

    function sliderRatio()
    {
        return Number(slider.value) / Number(slider.max);
    }

    playButton.addEventListener("click", () =>
    {
        playing = !playing;
        playButton.textContent = playing ? "Pause" : "Play";
        onPlayPause?.(playing);
    });

    slider.addEventListener("input", () =>
    {
        scrubbing = true;
        const time = sliderRatio() * duration;
        timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
        onSeek?.(time);
    });

    slider.addEventListener("change", () =>
    {
        scrubbing = false;
    });

    /** Show the timeline for a clip, or hide it when `clipDuration` is null. */
    function setClip(clipDuration)
    {
        duration = clipDuration ?? 0;
        wrapper.hidden = clipDuration == null;
        playing = true;
        scrubbing = false;
        playButton.textContent = "Pause";
        slider.value = "0";
        timeLabel.textContent = `${formatTime(0)} / ${formatTime(duration)}`;
    }

    /** Reflect current playback time. No-op while the user is dragging the slider. */
    function setProgress(time)
    {
        if (scrubbing || wrapper.hidden) return;
        const ratio = duration > 0 ? time / duration : 0;
        slider.value = String(Math.round(ratio * Number(slider.max)));
        timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    }

    return { setClip, setProgress };
}
