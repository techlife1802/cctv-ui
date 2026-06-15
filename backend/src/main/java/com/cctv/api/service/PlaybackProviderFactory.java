package com.cctv.api.service;

import com.cctv.api.model.NVR;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PlaybackProviderFactory {

    private final List<PlaybackProvider> providers;

    public PlaybackProviderFactory(List<PlaybackProvider> providers) {
        this.providers = providers;
    }

    public PlaybackProvider getProvider(NVR nvr) {
        for (PlaybackProvider provider : providers) {
            if (provider.supports(nvr)) {
                return provider;
            }
        }
        throw new IllegalArgumentException("No playback provider found for NVR type: " + nvr.getType());
    }
}
