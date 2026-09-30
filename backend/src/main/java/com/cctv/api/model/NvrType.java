package com.cctv.api.model;

public enum NvrType {
    HIKVISION,
    CP_PLUS,
    ADIVA,
    SECURUS,
    SECURUS_DVR;

    public static NvrType fromString(String type) {
        if (type == null)
            return null;
        String normalized = type.toLowerCase().replace(" ", "").replace("_", "").replace("-", "");
        if (normalized.contains("hikvision"))
            return HIKVISION;
        if (normalized.contains("cpplus"))
            return CP_PLUS;
        if (normalized.contains("adiva"))
            return ADIVA;
        if (normalized.contains("securusdvr"))
            return SECURUS_DVR;
        if (normalized.contains("securus"))
            return SECURUS;
        return null;
    }
}
